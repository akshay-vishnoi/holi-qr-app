#!/bin/bash

set -e

echo "🚀 Starting Holi QR App Setup..."

# ------------------------------
# Install Homebrew (if missing)
# ------------------------------
if ! command -v brew &> /dev/null
then
    echo "📦 Installing Homebrew..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    eval "$(/opt/homebrew/bin/brew shellenv)"
else
    echo "✅ Homebrew already installed"
fi

# ------------------------------
# Install Node
# ------------------------------
if ! command -v node &> /dev/null
then
    echo "📦 Installing Node..."
    brew install node
else
    echo "✅ Node already installed"
fi

# ------------------------------
# Install PostgreSQL
# ------------------------------
if ! brew list postgresql@15 &> /dev/null
then
    echo "📦 Installing PostgreSQL..."
    brew install postgresql@15
fi

echo "🚀 Starting PostgreSQL service..."
brew services start postgresql@15

# ------------------------------
# Create Database
# ------------------------------
if ! psql -lqt | cut -d \| -f 1 | grep -qw holi_qr; then
    echo "🗄 Creating database holi_qr..."
    createdb holi_qr
else
    echo "✅ Database holi_qr already exists"
fi

# ------------------------------
# Install Dependencies
# ------------------------------
echo "📦 Installing npm packages..."
npm install

# ------------------------------
# Setup .env
# ------------------------------
echo "⚙️ Creating .env file..."
cat > .env <<EOL
DATABASE_URL=postgres://localhost:5432/holi_qr
JWT_SECRET=$(openssl rand -hex 32)
ADMIN_PASSWORD=holiadmin
EOL

# ------------------------------
# Run Migration
# ------------------------------
echo "🛠 Running migration..."
npm run migrate

# ------------------------------
# Start App
# ------------------------------
echo "🎉 Setup complete!"
echo "Opening app..."

npm start
