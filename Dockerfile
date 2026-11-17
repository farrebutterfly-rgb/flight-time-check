# Build the Go binary, then run the Python canary and tests in a small image.
FROM golang:1.24-alpine AS go
WORKDIR /src
COPY go/ go/
COPY examples/ examples/
COPY data/airports.json data/airports.json
RUN cd go && go test ./... && CGO_ENABLED=0 go build -o /ftcheck ./ftcheck

FROM python:3.13-slim
WORKDIR /app
RUN pip install --no-cache-dir pytest "mcp>=1.2"
COPY . .
COPY --from=go /ftcheck /usr/local/bin/ftcheck
RUN python -m pytest -q
CMD ["python", "canary.py"]
