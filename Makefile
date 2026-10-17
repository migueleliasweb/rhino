.PHONY: all proto test build run clean

all: proto test build

proto:
	buf generate

test:
	go test -v -race ./...

build:
	go build -o bin/rhino .

run: build
	./bin/rhino serve --addr :8080 --driver mock

clean:
	rm -rf bin/
