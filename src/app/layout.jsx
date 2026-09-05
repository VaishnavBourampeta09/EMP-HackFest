import "leaflet/dist/leaflet.css";
import "@fontsource/outfit/400.css";
import "@fontsource/outfit/500.css";
import "@fontsource/outfit/600.css";
import "@fontsource/outfit/700.css";
import "../styles.css";

export const metadata = {
  title: "GuardianRoute — The route home, with context",
  description:
    "Safety-first walking and transit route comparison with proactive, trip-scoped guardian support.",
};

export const viewport = {
  themeColor: "#07130e",
  colorScheme: "dark light",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
