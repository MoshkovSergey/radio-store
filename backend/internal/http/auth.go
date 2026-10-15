package apihttp

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/mail"
	"strconv"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"golang.org/x/crypto/bcrypt"
)

type contextKey string

const (
	ctxUserID   contextKey = "user_id"
	ctxUserRole contextKey = "user_role"
)

type registerRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	FullName string `json:"full_name"`
}

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type userResponse struct {
	ID       int64   `json:"id"`
	Email    string  `json:"email"`
	FullName *string `json:"full_name,omitempty"`
	Role     string  `json:"role"`
}

type authResponse struct {
	Token string       `json:"token"`
	User  userResponse `json:"user"`
}

func (s *Server) register(w http.ResponseWriter, r *http.Request) {
	var req registerRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	email := strings.ToLower(strings.TrimSpace(req.Email))
	if _, err := mail.ParseAddress(email); err != nil {
		writeError(w, http.StatusBadRequest, "invalid email")
		return
	}

	if len(req.Password) < 8 || len(req.Password) > 72 {
		writeError(w, http.StatusBadRequest, "password must be between 8 and 72 characters")
		return
	}

	var fullNamePtr *string
	fullName := strings.TrimSpace(req.FullName)
	if fullName != "" {
		fullNamePtr = &fullName
	}

	passwordHash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		slog.Error("failed to hash password", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to register user")
		return
	}

	var user userResponse
	err = s.db.QueryRow(
		r.Context(),
		`
		INSERT INTO users (email, password_hash, full_name, role)
		VALUES ($1, $2, $3, 'customer')
		RETURNING id, email, full_name, role
		`,
		email,
		passwordHash,
		fullNamePtr,
	).Scan(&user.ID, &user.Email, &user.FullName, &user.Role)

	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			writeError(w, http.StatusConflict, "user with this email already exists")
			return
		}

		slog.Error("failed to register user", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to register user")
		return
	}

	token, err := s.generateToken(user)
	if err != nil {
		slog.Error("failed to generate token", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to generate token")
		return
	}

	writeJSON(w, http.StatusCreated, authResponse{
		Token: token,
		User:  user,
	})
}

func (s *Server) login(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	email := strings.ToLower(strings.TrimSpace(req.Email))
	if email == "" || req.Password == "" {
		writeError(w, http.StatusBadRequest, "email and password are required")
		return
	}

	var user userResponse
	var passwordHash string

	err := s.db.QueryRow(
		r.Context(),
		`
		SELECT id, email, password_hash, full_name, role
		FROM users
		WHERE email = $1
		`,
		email,
	).Scan(&user.ID, &user.Email, &passwordHash, &user.FullName, &user.Role)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusUnauthorized, "invalid email or password")
			return
		}

		slog.Error("failed to login user", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to login user")
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(req.Password)); err != nil {
		writeError(w, http.StatusUnauthorized, "invalid email or password")
		return
	}

	token, err := s.generateToken(user)
	if err != nil {
		slog.Error("failed to generate token", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to generate token")
		return
	}

	writeJSON(w, http.StatusOK, authResponse{
		Token: token,
		User:  user,
	})
}

func (s *Server) me(w http.ResponseWriter, r *http.Request) {
	userID, ok := userIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var user userResponse
	err := s.db.QueryRow(
		r.Context(),
		`
		SELECT id, email, full_name, role
		FROM users
		WHERE id = $1
		`,
		userID,
	).Scan(&user.ID, &user.Email, &user.FullName, &user.Role)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "user not found")
			return
		}

		slog.Error("failed to get current user", "user_id", userID, "error", err)
		writeError(w, http.StatusInternalServerError, "failed to get current user")
		return
	}

	writeJSON(w, http.StatusOK, user)
}

func (s *Server) generateToken(user userResponse) (string, error) {
	claims := jwt.MapClaims{
		"sub":   strconv.FormatInt(user.ID, 10),
		"email": user.Email,
		"role":  user.Role,
		"iat":   time.Now().Unix(),
		"exp":   time.Now().Add(24 * time.Hour).Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(s.jwtSecret))
}

func (s *Server) authMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
			writeError(w, http.StatusUnauthorized, "authorization header with bearer token is required")
			return
		}

		tokenString := strings.TrimPrefix(authHeader, "Bearer ")

		token, err := jwt.Parse(tokenString, func(t *jwt.Token) (interface{}, error) {
			if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
			}
			return []byte(s.jwtSecret), nil
		})

		if err != nil || !token.Valid {
			writeError(w, http.StatusUnauthorized, "invalid or expired token")
			return
		}

		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok {
			writeError(w, http.StatusUnauthorized, "invalid token claims")
			return
		}

		var userID int64

		switch sub := claims["sub"].(type) {
		case string:
			parsedID, err := strconv.ParseInt(sub, 10, 64)
			if err != nil || parsedID <= 0 {
				writeError(w, http.StatusUnauthorized, "invalid token subject")
				return
			}
			userID = parsedID
		case float64:
			userID = int64(sub)
		default:
			writeError(w, http.StatusUnauthorized, "invalid token subject")
			return
		}

		role, _ := claims["role"].(string)

		ctx := context.WithValue(r.Context(), ctxUserID, userID)
		ctx = context.WithValue(ctx, ctxUserRole, role)

		next.ServeHTTP(w, r.WithContext(ctx))
	}
}

func userIDFromContext(ctx context.Context) (int64, bool) {
	userID, ok := ctx.Value(ctxUserID).(int64)
	return userID, ok
}

func userRoleFromContext(ctx context.Context) string {
	role, _ := ctx.Value(ctxUserRole).(string)
	return role
}