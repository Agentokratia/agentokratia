import Link from 'next/link';
import { ROUTES, EXTERNAL_LINKS } from '@/lib/utils/constants';
import styles from './Footer.module.css';

const footerLinks = [
  {
    title: 'Product',
    links: [
      { href: ROUTES.MARKETPLACE, label: 'Marketplace' },
      { href: '#', label: 'Documentation' },
      { href: '#', label: 'Pricing' },
    ],
  },
  {
    title: 'Company',
    links: [
      { href: '#', label: 'About' },
      { href: '#', label: 'Blog' },
      { href: '#', label: 'Careers' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { href: '#', label: 'Privacy' },
      { href: '#', label: 'Terms' },
    ],
  },
  {
    title: 'Open Source',
    links: [{ href: EXTERNAL_LINKS.GITHUB, label: 'GitHub', external: true }],
  },
];

export function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.container}>
        <div className={styles.brand}>
          <span className={styles.logo}>Agentokratia</span>
          <p className={styles.tagline}>Infrastructure for autonomous AI agents</p>
        </div>

        <div className={styles.links}>
          {footerLinks.map((section) => (
            <div key={section.title} className={styles.section}>
              <h4 className={styles.sectionTitle}>{section.title}</h4>
              <ul className={styles.sectionLinks}>
                {section.links.map((link) => (
                  <li key={link.label}>
                    {'external' in link && link.external ? (
                      <a
                        href={link.href}
                        className={styles.link}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link href={link.href} className={styles.link}>
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.bottom}>
        <p className={styles.copyright}>
          &copy; {new Date().getFullYear()} Agentokratia. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
