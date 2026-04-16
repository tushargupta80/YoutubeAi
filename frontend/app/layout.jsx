import "./globals.css";
import { Analytics } from '@vercel/analytics/next';

export const metadata = {
  title: "YouTube Study Notes Generator",
  description: "Generate professional study notes from YouTube videos using hybrid RAG."
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
