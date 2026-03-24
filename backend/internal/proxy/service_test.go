package proxy

import (
	"net/http"
	"net/url"
	"testing"
)

func TestBuildTargetURL(t *testing.T) {
	target, err := buildTargetURL("https://api.example.com/v1", "/users", url.Values{
		"page": []string{"2"},
	})
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	expected := "https://api.example.com/v1/users?page=2"
	if target != expected {
		t.Fatalf("expected %s, got %s", expected, target)
	}
}

func TestHeadersStoredAsIs(t *testing.T) {
	headers := http.Header{
		"Authorization":  {"Bearer secret-token"},
		"Cookie":         {"session=abc123"},
		"Set-Cookie":     {"refresh=def456; Path=/"},
		"X-API-Key":      {"secret-api-key"},
		"X-Access-Token": {"very-secret-token"},
		"X-Password":     {"super-secret"},
		"Content-Type":   {"application/json"},
	}

	stored := headers
	if stored["Authorization"][0] != "Bearer secret-token" {
		t.Fatalf("expected authorization header to be stored as-is")
	}

	if stored["Cookie"][0] != "session=abc123" {
		t.Fatalf("expected cookie header to be stored as-is")
	}

	if stored["Set-Cookie"][0] != "refresh=def456; Path=/" {
		t.Fatalf("expected set-cookie header to be stored as-is")
	}

	if stored["X-API-Key"][0] != "secret-api-key" {
		t.Fatalf("expected x-api-key header to be stored as-is")
	}

	if stored["X-Access-Token"][0] != "very-secret-token" {
		t.Fatalf("expected token-style header to be stored as-is")
	}

	if stored["X-Password"][0] != "super-secret" {
		t.Fatalf("expected password-style header to be stored as-is")
	}

	if stored["Content-Type"][0] != "application/json" {
		t.Fatalf("expected non-sensitive header to stay visible")
	}
}

func TestCaptureBodyPreviewBinary(t *testing.T) {
	body := []byte{0xff, 0xd8, 0xff, 0xe0, 0x00}
	preview := captureBodyPreview(body, "image/jpeg", 10)

	if !preview.Binary {
		t.Fatalf("expected binary body to be marked binary")
	}
	if preview.Preview != "" {
		t.Fatalf("expected binary preview to be blank")
	}
}

func TestCaptureBodyPreviewUnlimitedStoresFullTextBody(t *testing.T) {
	body := []byte(`{"message":"hello world","items":[1,2,3],"nested":{"ok":true}}`)
	preview := captureBodyPreview(body, "application/json", 0)

	if preview.Binary {
		t.Fatalf("expected json body to be stored as text")
	}
	if preview.Truncated {
		t.Fatalf("expected unlimited preview limit to avoid truncation")
	}
	if preview.Preview != string(body) {
		t.Fatalf("expected full body to be stored, got %q", preview.Preview)
	}
	if preview.Size != len(body) {
		t.Fatalf("expected size %d, got %d", len(body), preview.Size)
	}
}
