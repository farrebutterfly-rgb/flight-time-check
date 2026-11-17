# One contract, four languages. `make test` runs every one of them.

.PHONY: test test-py test-ts test-go test-sql sync app canary docker

test: sync test-py test-sql test-ts test-go

sync:  ## copy the shared airport table into the Go and TypeScript packages
	cp data/airports.json go/ftcheck/airports.json
	cp data/airports.json ts/src/airports.json

test-py:
	python3 -m pytest -q

test-sql:
	python3 sql/run.py > /dev/null

test-ts:
	cd ts && npm ci --silent && npm test

test-go:
	cd go && go vet ./... && go test ./...

app:  ## build the program into one HTML file, app/dist/index.html
	cd app && npm ci --silent && npm run build

canary:
	python3 canary.py

docker:
	docker build -t flight-time-check .
