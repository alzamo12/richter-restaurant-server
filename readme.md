# 🍽️ Richter Restaurant - Backend

This is the **backend server** for the **Richter Restaurant** project, built using **Node.js**, **Express.js**, and **MongoDB**.  
It handles authentication, user management, menu operations, order processing, payments, email verification, and analytics.

---

## 🚀 Features

### **Authentication & Authorization**
- **JWT-based authentication** for secure API access.
- **Role-based authorization** (Admin/User).
- **Firebase Admin SDK** for managing user accounts and email verification.
- Custom email verification using **Nodemailer**.

### **User Management**
- Add, retrieve, update, and delete users.
- Assign admin roles.
- Email validation and verification link sending.
- Admin-only access to certain routes.

### **Menu Management**
- Create, read, update, and delete menu items.
- Pagination and filtering by category.
- Admin-only access for menu updates.

### **Cart & Orders**
- Add items to cart.
- Remove items from cart.
- Retrieve cart items by user email.
- Convert cart into orders after payment.

### **Payments**
- **Stripe Payment Integration** for secure transactions.
- Supports **cart checkout** and **reservation payments**.
- Deletes purchased items from the cart after successful payment.

### **Email Notifications**
- Sends order confirmation emails.
- Sends verification emails with unique token.

### **Reviews**
- Add and retrieve customer reviews.
- Authenticated users can post reviews.

### **Analytics**
- **Admin Dashboard Stats:**
  - Total users, menu items, orders, and revenue.
- **User Dashboard Stats:**
  - Menu count, cart count, bookings, orders, payments, and reviews count.

---

## 🛠️ Tech Stack

**Backend Framework:** Node.js, Express.js  
**Database:** MongoDB (with native MongoDB driver)  
**Authentication:** JWT, Firebase Admin SDK  
**Payments:** Stripe  
**Email Service:** Nodemailer (Gmail SMTP)  
**Other:** CORS, dotenv

---

## 📂 Project Structure


> ⚠️ Keep `.env` and `serviceAccount.json` private. Do not commit them to GitHub.

---

## 📦 Installation & Setup

1️⃣ **Clone the Repository**
```bash
git clone https://github.com/your-username/richter-restaurant-backend.git
cd richter-restaurant-backend
