import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import * as React from 'react';

import type { AppRole } from '../../types';

/**
 * Phase 7 plan 07-01 — React Email template for the user-onboarding invite.
 *
 * Mirrors the visual conventions of `sla-breach.tsx`:
 *   - paratus-blue (#2B479B) heading
 *   - slate body copy (#0F172A) with secondary slate for footer
 *   - accent-orange (#F7941D) call-to-action button
 *   - DM-Sans-leaning system font stack so the email reads on-brand even when
 *     the recipient's mail client strips the web font request
 *
 * Rendered server-side by Resend (`emails.send({ react: <InviteEmail … /> })`).
 *
 * PII surface: only the four template props are passed in. The full
 * `auth.users` row is never stored or transmitted by the email path.
 */
export interface InviteEmailProps {
  fullName: string;
  role: AppRole;
  countryName?: string | null;
  actionUrl: string;
  supportEmail: string;
}

const main = {
  backgroundColor: '#f6f8fb',
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'DM Sans', Roboto, Helvetica, Arial, sans-serif",
};

const container = {
  backgroundColor: '#ffffff',
  margin: '24px auto',
  padding: '32px',
  maxWidth: '560px',
  borderRadius: '12px',
  border: '1px solid #e2e8f0',
};

const heading = {
  color: '#2B479B',
  fontSize: '20px',
  fontWeight: 700,
  margin: '0 0 8px',
};

const body = {
  color: '#0F172A',
  fontSize: '14px',
  lineHeight: '22px',
  margin: '0 0 12px',
};

const meta = {
  color: '#475569',
  fontSize: '13px',
  lineHeight: '20px',
  margin: '0 0 4px',
};

const button = {
  backgroundColor: '#F7941D',
  color: '#ffffff',
  borderRadius: '8px',
  padding: '12px 20px',
  textDecoration: 'none',
  fontWeight: 600,
  display: 'inline-block',
  marginTop: '8px',
};

const footer = {
  color: '#64748b',
  fontSize: '12px',
  marginTop: '20px',
};

function humaniseRole(role: AppRole): string {
  return role.replace('_', ' ');
}

export function InviteEmail(props: InviteEmailProps): React.ReactElement {
  const { fullName, role, countryName, actionUrl, supportEmail } = props;
  const roleLabel = humaniseRole(role);

  return (
    <Html>
      <Head />
      <Preview>You have been invited to Paratus Group Dashboards</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>Welcome, {fullName}</Heading>
          <Text style={body}>
            Paratus Group has added you to the new sales dashboards. Set your
            password below to sign in.
          </Text>
          <Text style={body}>
            You&apos;re receiving this because Paratus Group has set you up as
            a {roleLabel} on the new dashboards.
          </Text>

          <Section>
            <Text style={meta}>
              <strong>Role:</strong> {roleLabel}
            </Text>
            {countryName ? (
              <Text style={meta}>
                <strong>Country:</strong> {countryName}
              </Text>
            ) : null}
          </Section>

          <Section style={{ marginTop: '20px' }}>
            <Button style={button} href={actionUrl}>
              Set up your account
            </Button>
          </Section>

          <Hr style={{ borderColor: '#e2e8f0', margin: '24px 0 12px' }} />
          <Text style={footer}>
            This link expires in 24 hours. If it does, email {supportEmail} for
            a fresh one.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default InviteEmail;
