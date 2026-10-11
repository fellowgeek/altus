#!/bin/bash

hurl --test --variable host="${HOST:-altus.test}" *.hurl
