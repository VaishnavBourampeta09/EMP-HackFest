import '../styles.css';

export const metadata = {
  title: 'GuardianRoute',
  description: 'Teen safety route monitoring demo',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
