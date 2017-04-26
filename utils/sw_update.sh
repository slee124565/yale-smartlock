#!/bin/bash -x

FILE_PATH=$(echo $(cd $(dirname "$0") && pwd -P)/$(basename "$0"))
BASEDIR=$(dirname "$(dirname "${FILE_PATH}")")

dest_path="${1}"
if [ -z "${dest_path}" ]; then
    dest_path=${BASEDIR}
fi

if [ -d "${dest_path}" ]; then
    cd ${dest_path}
    git_branch=$(git rev-parse --abbrev-ref HEAD)
    git checkout -f && git checkout ${git_branch} && git pull origin ${git_branch}
    cd -
fi


