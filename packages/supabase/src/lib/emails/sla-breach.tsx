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

import type { BreachLead } from '../../dal/sla';

/**
 * Phase 6 plan 06-01 — React Email template for the SLA breach alert.
 *
 * Rendered server-side by Resend (`emails.send({ react: <SlaBreachEmail … />})`).
 * AMA-mirror palette per `CLAUDE.md`: paratus-blue (#2B479B) for primary text,
 * accent orange (#F7941D) for the call-to-action button.
 *
 * PII surface: only the fields the template renders are passed in (name +
 * contact + agent name when assigned + age). The full lead row is never
 * stored or transmitted by the email path.
 */
export interface SlaBreachEmailProps {
  to: string;
  lead: BreachLead;
  ageMinutes: number;
  agentName?: string | null;
  countryName?: string | null;
  leadDeepLink: string;
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
  color: '#94a3b8',
  fontSize: '12px',
  marginTop: '20px',
};

export function SlaBreachEmail(props: SlaBreachEmailProps): React.ReactElement {
  const { lead, ageMinutes, agentName, countryName, leadDeepLink } = props;
  const country = countryName ?? lead.country_code;

  return (
    <Html>
      <Head />
      <Preview>{`Lead unanswered ${ageMinutes} min — ${country}`}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>SLA breach: lead unanswered for {ageMinutes} minutes</Heading>
          <Text style={body}>
            A lead in <strong>{country}</strong> has been waiting longer than the
            5-minute response target.
          </Text>

          <Section>
            <Text style={meta}>
              <strong>Lead:</strong> {lead.full_name ?? '—'}
            </Text>
            <Text style={meta}>
              <strong>Email:</strong> {lead.email ?? '—'}
            </Text>
            <Text style={meta}>
              <strong>Phone:</strong> {lead.phone ?? '—'}
            </Text>
            <Text style={meta}>
              <strong>Assigned to:</strong> {agentName ?? 'Unassigned'}
            </Text>
            <Text style={meta}>
              <strong>Age:</strong> {ageMinutes} min ({lead.age_seconds}s)
            </Text>
          </Section>

          <Section style={{ marginTop: '20px' }}>
            <Button style={button} href={leadDeepLink}>
              Open lead in dashboard
            </Button>
          </Section>

          <Hr style={{ borderColor: '#e2e8f0', margin: '24px 0 12px' }} />
          <Text style={footer}>
            Paratus Group — automated SLA monitor. You are receiving this email
            because you administer the {country} dashboard.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default SlaBreachEmail;
