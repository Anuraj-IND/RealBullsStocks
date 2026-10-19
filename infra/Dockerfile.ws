FROM golang:1.23-alpine AS build
WORKDIR /src
COPY apps/ws-gateway/go.mod apps/ws-gateway/go.sum* ./
RUN go mod download || true
COPY apps/ws-gateway ./
RUN CGO_ENABLED=0 GOOS=linux go build -o /out/ws-gateway ./cmd/gateway

FROM gcr.io/distroless/static-debian12 AS runtime
COPY --from=build /out/ws-gateway /ws-gateway
EXPOSE 8080
ENTRYPOINT ["/ws-gateway"]
