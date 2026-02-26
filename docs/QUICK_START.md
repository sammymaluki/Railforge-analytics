# Quick Start Guide - Sidekick System

## Prerequisites
- Node.js 18+
- SQL Server 2019+
- Git

## 1. Clone and Setup

```bash
# Clone the repository (when available)
git clone <repository-url>
cd herzog

# Or create from scratch using our structure
mkdir herzog
cd herzog
# Copy all the files from our setup


## Database Setup

# 1. Install SQL Server (if not installed)
# 2. Create database
sqlcmd -S localhost -U sa -P YourStrong!Passw0rd
CREATE DATABASE HerzogRailAuthority;
GO
EXIT

# 3. Run migrations
cd backend
npm install
npm run db:migrate
npm run db:seed


# Configure environment
cp .env.example .env
# Edit .env with your database credentials

# Start development server
npm run dev

# Server runs at http://localhost:5000

# Admin Portal Setup
cd admin-portal

# Install dependencies
npm install

# Configure environment
cp .env.example .env

# Start development server
npm start

# Portal runs at http://localhost:3000

## **Testing the Setup**
# Test API health
curl http://localhost:5000/api/health

# Test basic API
curl http://localhost:5000/api

# Login as admin
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'




# Terminal 2: Start the admin portal
cd herzog/admin-portal
npm install
npm start


# Run seed data


# Import full Metro Link Excel data (tracks + mileposts)
# If the file is in swl/seeds:
node backend/scripts/import-metrolink-data-simple.js --excel "swl/seeds/Metro Link map Data.xlsx" --target-agency-id 1

# If the file is in backend/sql/seeds:
node backend/scripts/import-metrolink-data-simple.js --excel "backend/sql/seeds/Metro Link map Data.xlsx" --target-agency-id 1

# Validate the database
node scripts/validate-database.js

# Testing the backend
# 1. Start the backend
cd backend
npm run dev

# 2. Test API with curl or Postman

# Login as admin
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'

# Get active authorities
curl -X GET http://localhost:5000/api/authorities/active \
  -H "Authorization: Bearer YOUR_TOKEN"

# Create authority (Ryan Medlin example)
curl -X POST http://localhost:5000/api/authorities \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "authorityType": "Track_Authority",
    "subdivisionId": 1,
    "beginMP": 1.0,
    "endMP": 7.0,
    "trackType": "Main",
    "trackNumber": "1",
    "employeeNameDisplay": "Ryan Medlin",
    "employeeContactDisplay": "555-987-6543"
  }'

## Support & Maintenance
- Built by OdedeTech Hub - [Bringing ideas into life]
- You can reach out for support or further partnership through [shemonyango06@gmail.com]
