# Stage 1: Build
FROM alpine:latest AS builder
RUN apk add --no-cache g++ gcc wget unzip
WORKDIR /build
RUN wget https://www.sqlite.org/2024/sqlite-amalgamation-3470100.zip && \
    unzip sqlite-amalgamation-3470100.zip && \
    mv sqlite-amalgamation-3470100/* .

COPY . .
# Compile sqlite3.c as C
RUN gcc -Os -c sqlite3.c -o sqlite3.o \
    -DSQLITE_OMIT_LOAD_EXTENSION \
    -DSQLITE_OMIT_DEPRECATED \
    -DSQLITE_THREADSAFE=1

# Compile main.cpp and link with sqlite3.o
RUN g++ -Os -s -static \
    -fno-exceptions -fno-rtti \
    -ffunction-sections -fdata-sections \
    -Wl,--gc-sections \
    -flto \
    -I. \
    -o api server/main.cpp sqlite3.o -lpthread -ldl

# Stage 2: Final
FROM scratch
COPY --from=builder /build/api /api
EXPOSE 8081
ENTRYPOINT ["/api"]
