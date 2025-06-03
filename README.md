# Chapter Performance Dashboard API

A RESTful API built with Node.js, Express, MongoDB, and Redis for tracking and analyzing chapter performance across subjects.

## Features

- **RESTful API Endpoints**:
  - GET /api/v1/chapters - List all chapters with filtering and pagination
  - GET /api/v1/chapters/:id - Get a specific chapter
  - POST /api/v1/chapters - Upload JSON data with chapter information (admin only)

- **Redis Caching**: 
  - API responses cached for 1 hour
  - Cache invalidation on data updates

- **Rate Limiting**: 
  - 30 requests per minute per IP address

- **MongoDB Integration**:
  - Mongoose schema validation
  - Efficient indexing for common queries

## Tech Stack

- **Node.js & Express**: Backend server and API routing
- **MongoDB & Mongoose**: Data storage and schema validation
- **Redis**: Caching and rate limiting
- **Multer**: File upload handling
- **Joi**: Data validation

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- MongoDB
- Redis

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/chapter-performance-dashboard.git
   cd chapter-performance-dashboard
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy the example environment file and update with your configuration:
   ```bash
   cp .env.example .env
   ```

4. Update the .env file with your MongoDB and Redis connection details:
   ```
   PORT=5000
   NODE_ENV=development
   MONGO_URI=mongodb://localhost:27017/chapter-dashboard
   REDIS_URL=redis://localhost:6379
   ADMIN_API_KEY=your-secret-api-key-here
   ```

5. Seed the database with initial data:
   ```bash
   npm run seed
   ```

6. Start the server:
   ```bash
   npm start
   ```

### Docker Setup (Optional)

1. Make sure Docker and Docker Compose are installed
2. Run the application using Docker Compose:
   ```bash
   docker-compose up -d
   ```

## API Documentation

### GET /api/v1/chapters

Fetches chapters with filtering and pagination.

**Query Parameters:**
- `class` - Filter by class (e.g., "Class 11")
- `unit` - Filter by unit (e.g., "Mechanics 1")
- `status` - Filter by status ("Not Started", "In Progress", "Completed")
- `weakChapters` - Filter by weak chapter status (true/false)
- `subject` - Filter by subject (e.g., "Physics")
- `page` - Page number (default: 1)
- `limit` - Results per page (default: 10)

**Response:**
```json
{
  "success": true,
  "total": 100,
  "page": 1,
  "limit": 10,
  "chapters": [
    {
      "_id": "60d21b4667d0d8992e610c85",
      "subject": "Physics",
      "chapter": "Units and Dimensions",
      "class": "Class 11",
      "unit": "Mechanics 1",
      "yearWiseQuestionCount": {
        "2019": 2,
        "2020": 6,
        "2021": 8,
        "2022": 4,
        "2023": 6,
        "2024": 3,
        "2025": 10
      },
      "questionSolved": 39,
      "status": "Completed",
      "isWeakChapter": true
    }
  ]
}
```

### GET /api/v1/chapters/:id

Fetches a specific chapter by its ID.

**Response:**
```json
{
  "success": true,
  "chapter": {
    "_id": "60d21b4667d0d8992e610c85",
    "subject": "Physics",
    "chapter": "Units and Dimensions",
    "class": "Class 11",
    "unit": "Mechanics 1",
    "yearWiseQuestionCount": {
      "2019": 2,
      "2020": 6,
      "2021": 8,
      "2022": 4,
      "2023": 6,
      "2024": 3,
      "2025": 10
    },
    "questionSolved": 39,
    "status": "Completed",
    "isWeakChapter": true
  }
}
```

### POST /api/v1/chapters

Uploads a JSON file containing an array of chapters.

**Headers:**
- `x-api-key` - Admin API key

**Body:**
- `file` - JSON file containing an array of chapter objects

**Response:**
```json
{
  "success": true,
  "message": "Successfully processed 10 chapters",
  "successCount": 8,
  "failedCount": 2,
  "failedChapters": [
    {
      "chapter": {
        "subject": "Physics",
        "chapter": "Example Chapter"
      },
      "error": "\"class\" is required"
    }
  ]
}
```

## Deployment

### Deploying to Render

1. Create a new Web Service on Render
2. Connect your GitHub repository
3. Configure the service:
   - Name: chapter-performance-dashboard
   - Environment: Node
   - Build Command: `npm install`
   - Start Command: `npm start`
4. Add environment variables (PORT, MONGO_URI, REDIS_URL, ADMIN_API_KEY)
5. Deploy the service

### Deploying to AWS EC2

1. Launch an EC2 instance
2. Install Node.js, MongoDB, and Redis
3. Clone your repository
4. Set up environment variables
5. Install PM2: `npm install -g pm2`
6. Start the application: `pm2 start server.js`
7. Configure PM2 startup: `pm2 startup` and `pm2 save`

## GitHub Actions Workflow

Create a `.github/workflows/deploy.yml` file with the following content to set up automatic deployment to EC2:

```yaml
name: Deploy to EC2

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v2
    
    - name: Install Node.js
      uses: actions/setup-node@v2
      with:
        node-version: '16'
        
    - name: Install dependencies
      run: npm install
      
    - name: Run tests
      run: npm test
      
    - name: Deploy to EC2
      uses: appleboy/ssh-action@master
      with:
        host: ${{ secrets.EC2_HOST }}
        username: ${{ secrets.EC2_USERNAME }}
        key: ${{ secrets.EC2_PRIVATE_KEY }}
        script: |
          cd ~/chapter-performance-dashboard
          git pull
          npm install
          pm2 restart server
```

## License

MIT