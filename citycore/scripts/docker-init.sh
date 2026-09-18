#!/bin/bash
set -e
# Runs only on an empty MariaDB volume. The official image exports this helper.
docker_process_sql <<'SQL'
CREATE DATABASE IF NOT EXISTS citycore_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON citycore_test.* TO 'citycore'@'%';
SQL
