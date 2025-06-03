/**
 * Authentication middleware for admin-only routes
 * Uses a simple API key-based authentication
 */
const adminAuth = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey || apiKey !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized: Invalid API Key'
    });
  }
  
  next();
};

module.exports = { adminAuth };