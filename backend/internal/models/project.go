package models

import "time"

type Project struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Slug      string    `json:"slug"`
	BaseURL   string    `json:"baseUrl"`
	IsActive  bool      `json:"isActive"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type CreateProjectInput struct {
	Name     string `json:"name"`
	Slug     string `json:"slug"`
	BaseURL  string `json:"baseUrl"`
	IsActive *bool  `json:"isActive,omitempty"`
}
