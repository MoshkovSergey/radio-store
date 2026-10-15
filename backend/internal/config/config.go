package config

import (
	"fmt"
	"os"
	"strconv"
)

type SMTPConfig struct {
	Host     string
	Port     int
	Username string
	Password string
	From     string
	FromName string
}

// Enabled возвращает true, если задан хотя бы хост SMTP.
func (c SMTPConfig) Enabled() bool {
	return c.Host != ""
}

type Config struct {
	HTTPAddr      string
	DatabaseURL   string
	AuthJWTSecret string
	UploadDir     string
	SMTP          SMTPConfig
}

func Load() (Config, error) {
	smtpPort, _ := strconv.Atoi(getEnv("SMTP_PORT", "587"))

	cfg := Config{
		HTTPAddr:      getEnv("HTTP_ADDR", ":8080"),
		DatabaseURL:   getEnv("DATABASE_URL", "postgres://app:app@localhost:5432/radio_store?sslmode=disable"),
		AuthJWTSecret: getEnv("AUTH_JWT_SECRET", "dev-secret-change-me"),
		UploadDir:     getEnv("UPLOAD_DIR", "./uploads"),
		SMTP: SMTPConfig{
			Host:     getEnv("SMTP_HOST", ""),
			Port:     smtpPort,
			Username: getEnv("SMTP_USERNAME", ""),
			Password: getEnv("SMTP_PASSWORD", ""),
			From:     getEnv("SMTP_FROM", ""),
			FromName: getEnv("SMTP_FROM_NAME", "Radio Store"),
		},
	}

	if cfg.DatabaseURL == "" {
		return Config{}, fmt.Errorf("DATABASE_URL cannot be empty")
	}

	if cfg.AuthJWTSecret == "" {
		return Config{}, fmt.Errorf("AUTH_JWT_SECRET cannot be empty")
	}

	if cfg.UploadDir == "" {
		return Config{}, fmt.Errorf("UPLOAD_DIR cannot be empty")
	}

	return cfg, nil
}

func getEnv(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok && value != "" {
		return value
	}
	return fallback
}