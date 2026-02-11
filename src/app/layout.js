import "./globals.css";
import FirebaseAnalyticsInit from "@/components/FirebaseAnalyticsInit";

export const metadata = {
  title: "My Dashboard",
  description: "All  service in Single dashboard",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <FirebaseAnalyticsInit />
        {children}
      </body>
    </html>
  );
}
