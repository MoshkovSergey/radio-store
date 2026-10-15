package config

import (
	"fmt"
	"os"
)

type Config struct {
	HTTPAddr      string
	DatabaseURL   string
	AuthJWTSecret string
}

func Load() (Config, error) {
	cfg := Config{
		HTTPAddr:      getEnv("HTTP_ADDR", ":8080"),
		DatabaseURL:   getEnv("DATABASE_URL", "postgres://app:app@localhost:5432/radio_store?sslmode=disable"),
		AuthJWTSecret: getEnv("AUTH_JWT_SECRET", "dev-secret-change-me"),
	}

	if cfg.DatabaseURL == "" {
		return Config{}, fmt.Errorf("DATABASE_URL cannot be empty")
	}

	if cfg.AuthJWTSecret == "" {
		return Config{}, fmt.Errorf("AUTH_JWT_SECRET cannot be empty")
	}

	return cfg, nil
}

func getEnv(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok && value != "" {
		return value
	}
	return fallback
}