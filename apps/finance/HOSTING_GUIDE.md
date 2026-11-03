# Hosting Guide for ADK Expense (No Domain Required)

Since your application is built with React (Vite) and Supabase, it compiles into a high-performance **Static Single Page Application (SPA)**. When you build the app, it creates a folder called `dist/` containing all your static assets (HTML, CSS, JS).

Here are the two best ways to host this app without buying a domain name:

---

## 🚀 Option A: 100% Free Static Cloud Hosting (Highly Recommended)
Services like **Netlify**, **Vercel**, or **Render** are completely free, secure (automatic HTTPS), and give you a clean private subdomain link (e.g. `https://adk-expense.netlify.app`) without needing any domain name.

### Step 1: Build the app locally
In your project folder, run the production build command:
```powershell
npm run build
```
*(This creates a optimized `dist` folder inside your project directory).*

### Step 2: Upload to Netlify (Takes 30 seconds)
1. Go to [https://www.netlify.com/](https://www.netlify.com/) and sign up for a free account.
2. Go to your Netlify dashboard and select the **"Sites"** tab.
3. Scroll down to the bottom where you see: **"Want to deploy a new site without connecting to Git? Drag and drop your site folder here"**.
4. Drag your compiled **`dist`** folder from your computer and drop it into that box!
5. In your site settings, click **"Site configuration"** ➔ **"Change site name"** to choose your custom subdomain (e.g., `adk-expense-reports`).

### Step 3: Add your Env Variables on Netlify
To make sure Supabase connects:
1. Go to **Site Configuration** ➔ **Environment variables** ➔ **Add a variable**.
2. Add your keys exactly as they are in your `.env` file:
   - `VITE_SUPABASE_URL` = `"your_supabase_url"`
   - `VITE_SUPABASE_ANON_KEY` = `"your_supabase_anon_key"`
3. Click Save and trigger a redeploy. Your site is live!

---

## 🖥️ Option B: Raw IP Address Self-Hosting (VPS Server)
If you specifically want to access the app via a literal raw IP address (e.g., `http://128.199.64.21`), you can host it on a cheap Virtual Private Server (VPS) starting at $4/month (e.g. DigitalOcean, Hetzner, AWS EC2, or Linode).

Here is how to set it up:

### Step 1: Rent a VPS Droplet/Server
1. Go to **DigitalOcean** or **Hetzner** and create an account.
2. Spin up a basic server (Ubuntu Linux 22.04 LTS, Shared CPU, $4–$6/month).
3. Once created, you will receive a public **IPv4 Address** (e.g. `128.199.64.21`).

### Step 2: Connect to your Server via SSH
Open your command terminal (Powershell or Command Prompt) on Windows and connect to your server:
```powershell
ssh root@your_server_ip
```
*(Enter your server password when prompted).*

### Step 3: Install Nginx (High-Performance Web Server)
Run these commands in your server terminal to install and start Nginx:
```bash
sudo apt update
sudo apt install -y nginx
sudo systemctl start nginx
sudo systemctl enable nginx
```

### Step 4: Configure Nginx for React routing
Open the Nginx configuration file:
```bash
sudo nano /etc/nginx/sites-available/default
```
Replace the content inside `location /` with the following configuration (to allow React's router to handle direct page loads without throwing 404 errors):
```nginx
server {
    listen 80;
    server_name _;

    root /var/www/adk-expense;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```
*Press `Ctrl + O` to save, `Enter` to confirm, and `Ctrl + X` to exit nano.*

Test and reload Nginx:
```bash
sudo nginx -t
sudo systemctl reload nginx
```

### Step 5: Upload your build to the Server
1. Build your app locally:
   ```powershell
   npm run build
   ```
2. Create the target directory on your server:
   ```bash
   # (Run this inside your SSH session)
   sudo mkdir -p /var/www/adk-expense
   sudo chown -R $USER:$USER /var/www/adk-expense
   ```
3. Copy your local `dist` folder files to the server using `scp` (Secure Copy). Open a **new local terminal** (not the SSH session) inside your project directory and run:
   ```powershell
   scp -r dist/* root@your_server_ip:/var/www/adk-expense/
   ```

### Step 6: Test your app
Open your web browser and go directly to:
```text
http://your_server_ip
```
*Your application is now hosted and serving live directly from a raw IP address!*
