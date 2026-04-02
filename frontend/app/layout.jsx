import "./globals.css";

export const metadata = {
  title: "YouTube Study Notes Generator",
  description: "Generate professional study notes from YouTube videos using hybrid RAG."
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
