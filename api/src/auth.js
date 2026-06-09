const jwt = require('jsonwebtoken');

function getTokenFromRequest(request) {
  const auth = request.headers.get('authorization') || '';
  const [scheme, token] = auth.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) return null;
  return token;
}

function signUser(user) {
  const payload = {
    sub: user.id,
    username: user.username,
    fullName: user.fullName,
    role: user.role
  };
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not configured');
  return jwt.sign(payload, secret, { expiresIn: '12h' });
}

function verifyToken(token) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not configured');
  return jwt.verify(token, secret);
}

function requireAuth(request, options = {}) {
  const token = getTokenFromRequest(request);
  if (!token) {
    const err = new Error('Unauthorized');
    err.status = 401;
    throw err;
  }

  let user;
  try {
    user = verifyToken(token);
  } catch {
    const err = new Error('Invalid or expired token');
    err.status = 401;
    throw err;
  }

  if (options.adminOnly && user.role !== 'admin') {
    const err = new Error('Admin access required');
    err.status = 403;
    throw err;
  }

  return user;
}

module.exports = {
  signUser,
  requireAuth
};
