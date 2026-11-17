import { X509Certificate } from 'node:crypto';
import { getCACertificates, setDefaultCACertificates } from 'node:tls';

export function trustSystemCertificates(tls = { getCACertificates, setDefaultCACertificates }) {
  const now = Date.now();
  const system = tls.getCACertificates('system').filter((cert) => {
    try {
      return new X509Certificate(cert).validToDate.getTime() > now;
    } catch {
      return true;
    }
  });
  if (!system.length) return;
  tls.setDefaultCACertificates([...new Set([...tls.getCACertificates('default'), ...system])]);
}
