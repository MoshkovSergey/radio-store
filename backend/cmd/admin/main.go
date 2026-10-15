package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"

	"github.com/example/radio-store/backend/internal/config"
	"github.com/example/radio-store/backend/internal/db"
)

func main() {
	email := flag.String("email", "", "admin email")
	password := flag.String("password", "", "admin password")
	fullName := flag.String("name", "Admin", "admin full name")
	flag.Parse()

	if *email == "" || *password == "" {
		log.Fatal("usage: go run ./cmd/admin --email admin@shop.local --password StrongPassword123")
	}

	if len(*password) < 8 || len(*password) > 72 {
		log.Fatal("password must be between 8 and 72 characters")
	}

	cfg, err := config.Load()
	if err != nil {
		log.Fatal(err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	pool, err := db.New(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatal(err)
	}
	defer pool.Close()

	passwordHash, err := bcrypt.GenerateFromPassword([]byte(*password), bcrypt.DefaultCost)
	if err != nil {
		log.Fatal(err)
	}

	normalizedEmail := strings.ToLower(strings.TrimSpace(*email))
	normalizedFullName := strings.TrimSpace(*fullName)

	_, err = pool.Exec(
		ctx,
		`
		INSERT INTO users (email, password_hash, full_name, role)
		VALUES ($1, $2, $3, 'admin')
		ON CONFLICT (email)
		DO UPDATE SET
			password_hash = EXCLUDED.password_hash,
			role = 'admin',
			full_name = COALESCE(EXCLUDED.full_name, users.full_name),
			updated_at = now()
		`,
		normalizedEmail,
		passwordHash,
		normalizedFullName,
	)
	if err != nil {
		log.Fatal(err)
	}

	fmt.Printf("admin user created/updated: %s\n", normalizedEmail)
}