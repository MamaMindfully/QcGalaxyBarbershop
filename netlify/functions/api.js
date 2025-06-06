const { Pool, neonConfig } = require('@neondatabase/serverless');
const { drizzle } = require('drizzle-orm/neon-serverless');
const { pgTable, serial, varchar, text, timestamp } = require('drizzle-orm/pg-core');
const { eq } = require('drizzle-orm');

neonConfig.webSocketConstructor = globalThis.WebSocket;

// Define database tables
const bookings = pgTable("bookings", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 50 }).notNull(),
  service: varchar("service", { length: 255 }).notNull(),
  date: varchar("date", { length: 50 }).notNull(),
  time: varchar("time", { length: 50 }).notNull(),
  status: varchar("status", { length: 50 }).default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
});

const contacts = pgTable("contacts", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  message: text("message").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Database setup
const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL 
});
const db = drizzle({ client: pool });

// Admin sessions storage
let adminSessions = new Map();

exports.handler = async (event, context) => {
  const { httpMethod, path, body, queryStringParameters } = event;
  
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json'
  };

  // Handle OPTIONS requests
  if (httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  try {
    const requestBody = body ? JSON.parse(body) : {};
    
    // Route handling
    if (path === '/.netlify/functions/api/bookings' || path.includes('api/bookings')) {
      
      if (httpMethod === 'POST') {
        const [booking] = await db
          .insert(bookings)
          .values({
            ...requestBody,
            status: 'pending'
          })
          .returning();
        
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify(booking)
        };
      }
      
      if (httpMethod === 'GET') {
        const allBookings = await db.select().from(bookings);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify(allBookings)
        };
      }
      
      if (httpMethod === 'PATCH' && path.includes('/status')) {
        const pathParts = path.split('/');
        const id = pathParts[pathParts.indexOf('bookings') + 1];
        const { status } = requestBody;
        
        const [updatedBooking] = await db
          .update(bookings)
          .set({ status })
          .where(eq(bookings.id, parseInt(id)))
          .returning();
        
        if (!updatedBooking) {
          return {
            statusCode: 404,
            headers,
            body: JSON.stringify({ message: 'Booking not found' })
          };
        }
        
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify(updatedBooking)
        };
      }
    }
    
    // Contact endpoints
    if (path === '/.netlify/functions/api/contacts' || path.includes('api/contacts')) {
      
      if (httpMethod === 'POST') {
        const [contact] = await db
          .insert(contacts)
          .values(requestBody)
          .returning();
        
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify(contact)
        };
      }
      
      if (httpMethod === 'GET') {
        const allContacts = await db.select().from(contacts);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify(allContacts)
        };
      }
    }
    
    // Admin authentication
    if (path.includes('api/admin/login')) {
      const { password } = requestBody;
      
      if (password === 'galaxy2024') {
        const sessionId = Math.random().toString(36).substring(7);
        const expiresAt = Date.now() + (8 * 60 * 60 * 1000); // 8 hours
        
        adminSessions.set(sessionId, { expiresAt });
        
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ 
            success: true, 
            sessionId,
            message: 'Login successful' 
          })
        };
      } else {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ 
            success: false, 
            message: 'Invalid password' 
          })
        };
      }
    }
    
    if (path.includes('api/admin/verify')) {
      const { sessionId } = requestBody;
      const session = adminSessions.get(sessionId);
      
      if (session && session.expiresAt > Date.now()) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ valid: true })
        };
      } else {
        if (session) {
          adminSessions.delete(sessionId);
        }
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ valid: false })
        };
      }
    }
    
    // Default 404
    return {
      statusCode: 404,
      headers,
      body: JSON.stringify({ message: 'Not found' })
    };
    
  } catch (error) {
    console.error('Function error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error', error: error.message })
    };
  }
};
