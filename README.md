# Simple Solitaire

A clean, modern implementation of Klondike Solitaire built with vanilla HTML, CSS, and JavaScript.

## Features

- Classic Klondike Solitaire gameplay
- Drag and drop cards
- Double-click to auto-send to foundations
- Undo functionality (up to 50 moves)
- Score tracking
- Timer
- Responsive design for mobile and desktop
- Confetti animation on win

## Play Locally

Simply open `index.html` in a web browser.

## Deploy to Vercel

This project is ready to deploy to Vercel with zero configuration needed.

### Option 1: Deploy from GitHub

1. Push this repository to GitHub
2. Visit [Vercel](https://vercel.com)
3. Click "New Project"
4. Import your GitHub repository
5. Click "Deploy"

Vercel will automatically detect the static site and deploy it.

### Option 2: Deploy using Vercel CLI

1. Install the Vercel CLI:
   ```bash
   npm i -g vercel
   ```

2. Run the deploy command:
   ```bash
   vercel
   ```

3. Follow the prompts to complete deployment

### Configuration

The project includes a `vercel.json` configuration file that ensures proper static file serving.

## How to Play

- **Objective**: Move all 52 cards to the four Foundation piles (one per suit) from Ace to King
- **Stock**: Click the deck to draw cards
- **Tableau**: Stack cards in descending rank with alternating colors
- **Foundations**: Build up from Ace to King in the same suit
- **Double-click**: Auto-send a card to its foundation
- **Undo**: Take back your last move

## License

Open source - feel free to use and modify as needed.
