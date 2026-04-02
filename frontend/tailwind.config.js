module.exports = {
  content: [
    "./app/**/*.{js,jsx}",
    "./components/**/*.{js,jsx}",
    "./services/**/*.{js,jsx}",
    "./lib/**/*.{js,jsx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#171717",
        paper: "#f7f2e8",
        accent: "#0f766e",
        accentSoft: "#d8f3ef",
        rust: "#b45309"
      },
      fontFamily: {
        display: ["Georgia", "serif"],
        body: ["'Segoe UI'", "sans-serif"]
      },
      boxShadow: {
        card: "0 20px 60px rgba(23, 23, 23, 0.08)"
      }
    }
  },
  plugins: []
};
