import { Stack } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

export default function TermsOfService() {
  return (
    <>
      <Stack.Screen options={{ title: 'Terms of Service' }} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
      >
        <Text style={styles.lastUpdated}>Last Updated: January 2026</Text>

        <View style={styles.section}>
          <Text style={styles.heading}>1. Acceptance of Terms</Text>
          <Text style={styles.paragraph}>
            By accessing and using Genfeed.ai (&quot;Service&quot;), you accept
            and agree to be bound by the terms and provision of this agreement.
            If you do not agree to abide by these terms, please do not use this
            Service.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.heading}>2. Description of Service</Text>
          <Text style={styles.paragraph}>
            Genfeed.ai provides an AI-powered content creation platform that
            helps users generate, manage, and publish content across various
            platforms. The Service includes content generation, scheduling,
            analytics, and workflow automation tools.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.heading}>3. User Accounts</Text>
          <Text style={styles.paragraph}>
            To access certain features of the Service, you must create an
            account. You are responsible for maintaining the confidentiality of
            your account credentials and for all activities that occur under
            your account. You agree to notify us immediately of any unauthorized
            use of your account.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.heading}>4. User Content</Text>
          <Text style={styles.paragraph}>
            You retain ownership of all content you create using the Service. By
            using the Service, you grant us a limited license to process, store,
            and display your content as necessary to provide the Service. You
            are solely responsible for ensuring your content does not violate
            any laws or third-party rights.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.heading}>5. AI-Generated Content</Text>
          <Text style={styles.paragraph}>
            Content generated using our AI tools is provided &quot;as is&quot;
            without warranty of accuracy. You are responsible for reviewing and
            editing AI-generated content before publication. We do not guarantee
            that AI-generated content will be original, accurate, or suitable
            for any particular purpose.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.heading}>6. Prohibited Uses</Text>
          <Text style={styles.paragraph}>
            You agree not to use the Service to: generate harmful, illegal, or
            misleading content; violate intellectual property rights; distribute
            spam or malware; harass or impersonate others; or attempt to gain
            unauthorized access to our systems.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.heading}>7. Payment and Billing</Text>
          <Text style={styles.paragraph}>
            Certain features require a paid subscription. By subscribing, you
            authorize us to charge your payment method on a recurring basis.
            Subscriptions automatically renew unless cancelled before the
            renewal date. Refunds are provided in accordance with our refund
            policy.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.heading}>8. Termination</Text>
          <Text style={styles.paragraph}>
            We may terminate or suspend your account at any time for violations
            of these terms. Upon termination, your right to use the Service
            ceases immediately. You may export your data before account
            termination.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.heading}>9. Limitation of Liability</Text>
          <Text style={styles.paragraph}>
            To the maximum extent permitted by law, Genfeed.ai shall not be
            liable for any indirect, incidental, special, consequential, or
            punitive damages arising from your use of the Service.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.heading}>10. Changes to Terms</Text>
          <Text style={styles.paragraph}>
            We reserve the right to modify these terms at any time. We will
            notify users of material changes via email or in-app notification.
            Continued use of the Service after changes constitutes acceptance of
            the new terms.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.heading}>11. Contact Information</Text>
          <Text style={styles.paragraph}>
            If you have any questions about these Terms of Service, please
            contact us at legal@genfeed.ai.
          </Text>
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#020617',
    flex: 1,
  },
  content: {
    padding: 24,
    paddingBottom: 64,
  },
  heading: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  lastUpdated: {
    color: '#64748b',
    fontSize: 13,
    marginBottom: 24,
  },
  paragraph: {
    color: '#cbd5f5',
    fontSize: 15,
    lineHeight: 24,
  },
  section: {
    marginBottom: 24,
  },
});
