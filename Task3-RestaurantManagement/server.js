const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// In-memory storage
let users = [];
let menuItems = [
  { id: 1, name: 'Chicken Biryani', price: 350, category: 'main-course', isAvailable: true },
  { id: 2, name: 'Seekh Kabab', price: 250, category: 'appetizer', isAvailable: true },
  { id: 3, name: 'Gulab Jamun', price: 120, category: 'dessert', isAvailable: true },
  { id: 4, name: 'Mango Lassi', price: 80, category: 'beverage', isAvailable: true },
  { id: 5, name: 'Chicken Karahi', price: 1200, category: 'main-course', isAvailable: true },
  { id: 6, name: 'Garlic Naan', price: 60, category: 'main-course', isAvailable: true }
];

// ==================== AUTH ROUTES ====================

app.post('/api/auth/register', (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    
    const existingUser = users.find(u => u.email === email);
    if (existingUser) {
      return res.status(400).json({ success: false, error: 'Email already exists' });
    }
    
    const user = { 
      id: users.length + 1, 
      name, 
      email, 
      password, 
      role: role || 'staff' 
    };
    users.push(user);
    
    res.status(201).json({ 
      success: true, 
      user: { id: user.id, name: user.name, email: user.email, role: user.role } 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/auth/login', (req, res) => {
  try {
    const { email, password } = req.body;
    
    const user = users.find(u => u.email === email && u.password === password);
    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }
    
    res.json({ 
      success: true, 
      user: { id: user.id, name: user.name, email: user.email, role: user.role } 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== MENU ROUTES ====================

app.get('/api/menu', (req, res) => {
  try {
    const { category } = req.query;
    let filtered = menuItems.filter(item => item.isAvailable);
    if (category) {
      filtered = filtered.filter(item => item.category === category);
    }
    res.json({ success: true, count: filtered.length, data: filtered });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/menu/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const item = menuItems.find(i => i.id === id);
    if (!item) {
      return res.status(404).json({ success: false, error: 'Item not found' });
    }
    res.json({ success: true, data: item });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/menu', (req, res) => {
  try {
    const { name, price, category, description, ingredients, spiceLevel } = req.body;
    
    if (!name || !price) {
      return res.status(400).json({ success: false, error: 'Name and price are required' });
    }
    
    const newItem = {
      id: menuItems.length + 1,
      name,
      price,
      category: category || 'main-course',
      description: description || '',
      ingredients: ingredients || [],
      spiceLevel: spiceLevel || 'medium',
      isAvailable: true
    };
    menuItems.push(newItem);
    res.status(201).json({ success: true, data: newItem });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put('/api/menu/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const index = menuItems.findIndex(i => i.id === id);
    if (index === -1) {
      return res.status(404).json({ success: false, error: 'Item not found' });
    }
    menuItems[index] = { ...menuItems[index], ...req.body };
    res.json({ success: true, data: menuItems[index] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/menu/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const index = menuItems.findIndex(i => i.id === id);
    if (index === -1) {
      return res.status(404).json({ success: false, error: 'Item not found' });
    }
    menuItems.splice(index, 1);
    res.json({ success: true, message: 'Item deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== TABLE ROUTES (Basic) ====================

let tables = [
  { id: 1, tableNumber: 1, capacity: 4, status: 'available' },
  { id: 2, tableNumber: 2, capacity: 2, status: 'available' },
  { id: 3, tableNumber: 3, capacity: 6, status: 'available' },
  { id: 4, tableNumber: 4, capacity: 4, status: 'available' }
];

app.get('/api/tables', (req, res) => {
  res.json({ success: true, data: tables });
});

app.put('/api/tables/:id/status', (req, res) => {
  const id = parseInt(req.params.id);
  const { status } = req.body;
  const table = tables.find(t => t.id === id);
  if (!table) {
    return res.status(404).json({ success: false, error: 'Table not found' });
  }
  table.status = status;
  res.json({ success: true, data: table });
});

// ==================== ORDER ROUTES (Basic) ====================

let orders = [];
let orderCounter = 1;

app.post('/api/orders', (req, res) => {
  try {
    const { tableId, customerName, items } = req.body;
    
    const table = tables.find(t => t.id === tableId);
    if (!table) {
      return res.status(404).json({ success: false, error: 'Table not found' });
    }
    
    if (table.status !== 'available') {
      return res.status(400).json({ success: false, error: 'Table is not available' });
    }
    
    let subtotal = 0;
    const orderItems = [];
    
    for (const item of items) {
      const menuItem = menuItems.find(m => m.id === item.menuItemId);
      if (!menuItem) {
        return res.status(404).json({ success: false, error: `Menu item ${item.menuItemId} not found` });
      }
      
      const itemTotal = menuItem.price * item.quantity;
      subtotal += itemTotal;
      
      orderItems.push({
        menuItemId: menuItem.id,
        name: menuItem.name,
        quantity: item.quantity,
        price: menuItem.price,
        subtotal: itemTotal
      });
    }
    
    const tax = subtotal * 0.10;
    const total = subtotal + tax;
    
    const order = {
      id: orderCounter++,
      orderNumber: `ORD-${Date.now()}`,
      tableId: tableId,
      customerName,
      items: orderItems,
      subtotal,
      tax,
      total,
      status: 'pending',
      createdAt: new Date()
    };
    
    orders.push(order);
    
    // Update table status
    table.status = 'occupied';
    
    res.status(201).json({ success: true, data: order });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/orders/active', (req, res) => {
  const activeOrders = orders.filter(o => ['pending', 'confirmed', 'preparing', 'ready'].includes(o.status));
  res.json({ success: true, count: activeOrders.length, data: activeOrders });
});

app.patch('/api/orders/:id/status', (req, res) => {
  const id = parseInt(req.params.id);
  const { status } = req.body;
  const order = orders.find(o => o.id === id);
  if (!order) {
    return res.status(404).json({ success: false, error: 'Order not found' });
  }
  order.status = status;
  
  if (status === 'paid') {
    const table = tables.find(t => t.id === order.tableId);
    if (table) {
      table.status = 'available';
    }
  }
  
  res.json({ success: true, data: order });
});

// ==================== HEALTH CHECK ====================

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date(), 
    uptime: process.uptime(),
    stats: {
      menuItems: menuItems.length,
      users: users.length,
      tables: tables.length,
      orders: orders.length
    }
  });
});

// ==================== 404 HANDLER (FIXED) ====================

// This must be the LAST route
app.use((req, res) => {
  res.status(404).json({ success: false, error: `Route ${req.method} ${req.url} not found` });
});

// ==================== ERROR HANDLER ====================

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, error: err.message });
});

// ==================== START SERVER ====================

const PORT = process.env.PORT || 3003;
app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════════════════════════════╗
  ║          🍽️ RESTAURANT MANAGEMENT SYSTEM - RUNNING              ║
  ╠══════════════════════════════════════════════════════════════════╣
  ║   Server: http://localhost:${PORT}                                 ║
  ║   Health: http://localhost:${PORT}/api/health                      ║
  ║   Mode: In-Memory Storage (No Database Required)                 ║
  ║                                                                  ║
  ║   📋 Available API Endpoints:                                    ║
  ║                                                                  ║
  ║   🔐 AUTH:                                                       ║
  ║     POST   /api/auth/register       - Register new user          ║
  ║     POST   /api/auth/login          - Login user                 ║
  ║                                                                  ║
  ║   📋 MENU:                                                        ║
  ║     GET    /api/menu                - Get all menu items         ║
  ║     GET    /api/menu/:id            - Get single item            ║
  ║     POST   /api/menu                - Add new menu item          ║
  ║     PUT    /api/menu/:id            - Update menu item           ║
  ║     DELETE /api/menu/:id            - Delete menu item           ║
  ║                                                                  ║
  ║   🪑 TABLES:                                                      ║
  ║     GET    /api/tables              - Get all tables             ║
  ║     PUT    /api/tables/:id/status   - Update table status        ║
  ║                                                                  ║
  ║   📦 ORDERS:                                                      ║
  ║     POST   /api/orders              - Create new order           ║
  ║     GET    /api/orders/active       - Get active orders          ║
  ║     PATCH  /api/orders/:id/status   - Update order status        ║
  ║                                                                  ║
  ║   ❤️ HEALTH:                                                      ║
  ║     GET    /api/health              - System health check        ║
  ╚══════════════════════════════════════════════════════════════════╝
  `);
});