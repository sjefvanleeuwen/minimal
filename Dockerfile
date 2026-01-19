# Stage 1: Build
FROM alpine:latest AS builder
RUN apk add --no-cache g++
COPY main.cpp .
RUN g++ -Os -s -static \
    -fno-exceptions -fno-rtti \
    -ffunction-sections -fdata-sections \
    -Wl,--gc-sections \
    -flto \
    -o api main.cpp

# Stage 2: Final
FROM scratch
COPY --from=builder /api /api
EXPOSE 8080
ENTRYPOINT ["/api"]
