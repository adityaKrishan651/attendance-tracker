# AttendanceHero 💥

A comic-book themed, gamified single page application for tracking student attendance. Built entirely with HTML5, CSS3, and Vanilla JavaScript. 

## Features
- **Comic Aesthetics**: Custom CSS components, ben-day dot backgrounds, floating panels, and comic 'pow' animations.
- **Data Safety**: Leverages Firebase Authentication (Google) and Cloud Firestore to seamlessly sync your attendance history across all your devices securely without deploying a custom backend.
- **Predictive Analytics**: Chat bubbles tell you *exactly* how many classes you can afford to skip, or how many you must attend to maintain your target attendance percentage!
- **Visual Calendar**: Explore your subject history on an interactive month-to-month comic calendar.
- **Gamified Engagement**: An overarching Donut Chart tracks your master completion percentage along with a visual Streak Counter.
- **Data Export**: Easily dump your historical data into a `.csv` format anytime.

## Installation & Running Locally

Because this relies on Firebase for authentication and database services, you must provide your own Firebase configuration keys.

1. Clone or download this project.
2. In the root directory, create a file named `env.js`.
3. Copy the contents of `env.example.js` into your new `env.js` file.
4. Replace the string placeholders with the keys from your Firebase Project Console. (Ensure Google Auth and Firestore are enabled on the project!)
5. Because this app is built with Vite, install the dependencies and start the development server:
   ```bash
   npm install
   npm run dev
   ```
6. Visit the local URL provided by Vite (usually `http://localhost:5173`) to preview the app!

## Design System
- **Fonts**: Bangers (Headings), Comic Neue (Body) - loaded directly via Google Fonts.
- **Mode**: Native Dark/Light toggle for easy nighttime viewing.

Enjoy managing your heroic deeds!
