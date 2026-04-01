#!/usr/bin/env bash
set -Eeuo pipefail

APP_NAME="multi-chat"
SERVICE_NAME="${APP_NAME}-backend"
NGINX_SITE="${APP_NAME}"
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

BACKEND_PORT="${BACKEND_PORT:-8080}"
INSTALL_DEPS=0
NO_SSL=0
DOMAIN=""
EMAIL=""
SERVICE_USER="${SUDO_USER:-$USER}"

usage() {
  cat <<'EOF'
Usage:
  ./deploy-vps.sh [options]

Options:
  --install-deps           Install Java 17, Maven, Node.js 20, Nginx, Certbot
  --domain <domain>        Domain for Nginx server_name and optional HTTPS
  --email <email>          Email for Let's Encrypt (used with --domain)
  --service-user <user>    User to run backend service (default: current user)
  --backend-port <port>    Backend port (default: 8080)
  --no-ssl                 Skip HTTPS certificate setup
  -h, --help               Show this help

Examples:
  ./deploy-vps.sh --install-deps --domain chat.example.com --email admin@example.com
  ./deploy-vps.sh --domain chat.example.com --email admin@example.com
  ./deploy-vps.sh --no-ssl
EOF
}

log() {
  printf '[%s] %s\n' "$(date '+%F %T')" "$*"
}

is_ip() {
  [[ "$1" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]
}

need_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing command: $cmd"
    echo "Try: ./deploy-vps.sh --install-deps"
    exit 1
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --install-deps)
      INSTALL_DEPS=1
      shift
      ;;
    --domain)
      DOMAIN="${2:-}"
      shift 2
      ;;
    --email)
      EMAIL="${2:-}"
      shift 2
      ;;
    --service-user)
      SERVICE_USER="${2:-}"
      shift 2
      ;;
    --backend-port)
      BACKEND_PORT="${2:-}"
      shift 2
      ;;
    --no-ssl)
      NO_SSL=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      usage
      exit 1
      ;;
  esac
done

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "This script is designed for Ubuntu/Debian Linux servers."
  exit 1
fi

if [[ "$APP_DIR" =~ [[:space:]] ]]; then
  echo "Project path contains spaces: $APP_DIR"
  echo "Please move project to a path without spaces, for example /opt/multi-chat."
  exit 1
fi

if [[ ! -d "$APP_DIR/backend" || ! -d "$APP_DIR/frontend" ]]; then
  echo "Cannot find backend/frontend folders under: $APP_DIR"
  exit 1
fi

if [[ "$INSTALL_DEPS" -eq 1 ]]; then
  log "Installing system dependencies..."
  sudo apt-get update
  sudo apt-get install -y openjdk-17-jdk maven nginx curl rsync

  if ! command -v node >/dev/null 2>&1; then
    log "Installing Node.js 20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
  fi

  if [[ "$NO_SSL" -eq 0 ]]; then
    sudo apt-get install -y certbot python3-certbot-nginx
  fi
fi

need_cmd java
need_cmd mvn
need_cmd npm
need_cmd nginx
need_cmd rsync
need_cmd systemctl
need_cmd sudo

log "Building backend..."
pushd "$APP_DIR/backend" >/dev/null
mvn -DskipTests clean package
JAR_FILE="$(find target -maxdepth 1 -type f -name '*.jar' ! -name '*original*' | head -n 1)"
if [[ -z "$JAR_FILE" ]]; then
  echo "No runnable jar found under backend/target."
  exit 1
fi
cp -f "$JAR_FILE" target/app.jar
popd >/dev/null

log "Building frontend..."
pushd "$APP_DIR/frontend" >/dev/null
if [[ -f package-lock.json ]]; then
  npm ci
else
  npm install
fi
npm run build
popd >/dev/null

log "Publishing frontend files to /var/www/${APP_NAME}..."
sudo mkdir -p "/var/www/${APP_NAME}"
sudo rsync -a --delete "$APP_DIR/frontend/dist/" "/var/www/${APP_NAME}/"

SERVICE_HOME="$(getent passwd "$SERVICE_USER" | cut -d: -f6 || true)"
if [[ -z "$SERVICE_HOME" ]]; then
  echo "Cannot resolve home directory for service user: $SERVICE_USER"
  exit 1
fi
CONFIG_DIR="${SERVICE_HOME}/.multi-chat"
CONFIG_FILE="${CONFIG_DIR}/api-configs.json"
sudo mkdir -p "$CONFIG_DIR"
sudo chown -R "$SERVICE_USER:$SERVICE_USER" "$CONFIG_DIR"

log "Writing systemd service: ${SERVICE_NAME}.service"
sudo tee "/etc/systemd/system/${SERVICE_NAME}.service" >/dev/null <<EOF
[Unit]
Description=Multi Chat Backend
After=network.target

[Service]
Type=simple
User=${SERVICE_USER}
WorkingDirectory=${APP_DIR}/backend
ExecStart=/usr/bin/java -jar ${APP_DIR}/backend/target/app.jar
Restart=always
RestartSec=5
Environment=MULTICHAT_API_CONFIG_FILE=${CONFIG_FILE}
Environment=JAVA_TOOL_OPTIONS=-Dfile.encoding=UTF-8

[Install]
WantedBy=multi-user.target
EOF

SERVER_NAME="${DOMAIN:-_}"
log "Writing Nginx site config: ${NGINX_SITE}"
sudo tee "/etc/nginx/sites-available/${NGINX_SITE}" >/dev/null <<EOF
server {
    listen 80;
    server_name ${SERVER_NAME};

    root /var/www/${APP_NAME};
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:${BACKEND_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_buffering off;
        proxy_read_timeout 3600s;
    }

    location = /health {
        proxy_pass http://127.0.0.1:${BACKEND_PORT}/health;
    }
}
EOF

sudo ln -sfn "/etc/nginx/sites-available/${NGINX_SITE}" "/etc/nginx/sites-enabled/${NGINX_SITE}"
if [[ -L "/etc/nginx/sites-enabled/default" ]]; then
  sudo rm -f "/etc/nginx/sites-enabled/default"
fi

log "Reloading services..."
sudo nginx -t
sudo systemctl daemon-reload
sudo systemctl enable --now "${SERVICE_NAME}"
sudo systemctl restart "${SERVICE_NAME}"
sudo systemctl enable --now nginx
sudo systemctl reload nginx

if command -v ufw >/dev/null 2>&1; then
  if sudo ufw status | grep -q "Status: active"; then
    log "Configuring firewall rules (ufw)..."
    sudo ufw allow OpenSSH >/dev/null || true
    sudo ufw allow "Nginx Full" >/dev/null || true
  fi
fi

if [[ "$NO_SSL" -eq 0 ]] && [[ -n "$DOMAIN" ]] && ! is_ip "$DOMAIN"; then
  if ! command -v certbot >/dev/null 2>&1; then
    echo "certbot not found. Install it or run with --install-deps."
    exit 1
  fi

  if [[ -n "$EMAIL" ]]; then
    log "Applying HTTPS certificate for ${DOMAIN}..."
    sudo certbot --nginx -d "$DOMAIN" -m "$EMAIL" --agree-tos --non-interactive --redirect
  else
    echo "Domain is set but email is empty. Skip auto-HTTPS."
    echo "Manual command:"
    echo "sudo certbot --nginx -d ${DOMAIN} -m you@example.com --agree-tos --redirect"
  fi
fi

log "Deployment completed."
echo
echo "Health check:"
if [[ -n "$DOMAIN" ]]; then
  if [[ "$NO_SSL" -eq 0 ]] && ! is_ip "$DOMAIN"; then
    echo "  curl -i https://${DOMAIN}/health"
    echo "  Open: https://${DOMAIN}"
  else
    echo "  curl -i http://${DOMAIN}/health"
    echo "  Open: http://${DOMAIN}"
  fi
else
  echo "  curl -i http://<your-server-ip>/health"
  echo "  Open: http://<your-server-ip>"
fi
echo
echo "Backend logs:"
echo "  sudo journalctl -u ${SERVICE_NAME} -f"
