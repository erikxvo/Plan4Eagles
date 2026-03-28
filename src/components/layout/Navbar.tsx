"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./Navbar.module.css";

const links = [
  { href: "/", label: "Home" },
  { href: "/scheduling", label: "Scheduling" },
  { href: "/plan", label: "4-Year Plan" },
  { href: "/opportunities", label: "Opportunities" },
];

export default function Navbar() {
  const pathname = usePathname();

  return (
    <header className={styles.navbar}>
      <h1 className={styles.logo}>Plan4Eagles</h1>
      <nav className={styles.nav}>
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`${styles.navLink} ${pathname === link.href ? styles.active : ""}`}
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
