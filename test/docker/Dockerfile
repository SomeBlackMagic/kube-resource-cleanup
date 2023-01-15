FROM alpine

RUN set -eux \
    && apk update \
    && apk upgrade \
    && apk add --no-cache bash procps \
    && true

COPY test.sh /test.sh
