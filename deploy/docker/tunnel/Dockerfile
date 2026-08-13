FROM alpine:3.22

RUN apk add --no-cache openssh-client

COPY entrypoint.sh /usr/local/bin/mcodex-tunnel
RUN chmod 0755 /usr/local/bin/mcodex-tunnel

ENTRYPOINT ["/usr/local/bin/mcodex-tunnel"]
