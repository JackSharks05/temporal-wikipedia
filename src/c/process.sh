#!/bin/bash

# Convert input to a stream of non-stopword terms
# Usage: input > ./process.sh > output

# Convert non-letter characters to newlines, make lowercase, convert to ASCII; then remove stopwords (inside d/stopwords.txt)
# Non-letter characters include things like ©, ®, and ™ as well!
#
# Commands that will be useful: tr, iconv, grep

# Tip: Make sure your program doesn't emit a non-zero exit code if there are no words left after removing stopwords.
# You can combine the grep invocation with `|| true` to achieve this. Be careful though, as this will also hide other errors!

DIR=$(dirname "$0")
STOPWORDS="$DIR/../d/stopwords.txt"
# convert all uppercase to lowercase
tr '[:upper:]' '[:lower:]' | \
# convert non-letter characters to newlines
tr -c '[:alpha:]' '\n' | \
# convert to ascii
iconv -f utf-8 -t ASCII//TRANSLIT | \
# remove stopwords
grep -F -x -v -f "$STOPWORDS" || true