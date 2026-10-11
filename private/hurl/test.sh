#!/bin/bash

hurl --test --jobs 1 --variable host="${HOST:-altus.test}" *.hurl
