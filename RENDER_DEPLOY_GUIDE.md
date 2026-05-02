# 🚀 Deploying to Render

You are all set! I have added the `render.yaml` configuration which Render calls a **Blueprint**. This file tells Render exactly how to set up your backend and frontend.

## Step 1: Push your code to GitHub/GitLab
Ensure all your changes (including the new `render.yaml` and updated `requirements.txt`) are pushed to your remote repository.

## Step 2: Connect to Render
1. Go to the [Render Dashboard](https://dashboard.render.com).
2. Click **New +** and select **Blueprint**.
3. Connect your GitHub/GitLab repository.
4. Render will automatically detect the `render.yaml` file.
5. It will show you a "Blueprint Instance" which includes:
   - `wallet-backend` (Web Service)
   - `wallet-frontend` (Static Site)

## Step 3: Set Environment Variables
Before clicking "Apply", you need to provide your **Etherscan API Key**:
1. In the Blueprint setup page, look for the `wallet-backend` service.
2. Under "Environment Variables", locate `ETHERSCAN_API_KEY`.
3. Paste your key(s) there (you can use a single key or a comma-separated list like in your `.env`).

## Step 4: Deploy
Click **Apply**. Render will start building both services.
- The **Backend** will be available at something like `wallet-backend.onrender.com`.
- The **Frontend** will be available at something like `wallet-frontend.onrender.com`.

> [!TIP]
> **Dynamic Linking**: You don't need to manually tell the frontend where the backend is. The `render.yaml` already tells Render to automatically inject the backend's URL into the frontend's `VITE_API_BASE_URL` variable.

## Step 5: Verify
Once both are "Live":
1. Open the Frontend URL.
2. Log in with `demo` / `demo`.
3. Try scanning an address.

> [!NOTE]
> **Free Tier Sleep**: Because this is the free tier, the backend will go to sleep after 15 minutes of inactivity. When you first visit the site after a long break, it might take ~30 seconds for the backend to "wake up".
