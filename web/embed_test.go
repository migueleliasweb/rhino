package web_test

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/migueleliasweb/rhino/web"
)

func TestEmbeddedWebHandler(t *testing.T) {
	handler := web.Handler()
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/", nil)

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", rec.Code)
	}

	body := rec.Body.String()
	if !strings.Contains(body, "Rhino — Visual Node-Based Hypervisor") {
		t.Fatalf("expected index.html to contain title, got: %s", body)
	}
}
