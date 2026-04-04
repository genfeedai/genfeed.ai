import { Stack } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

export default function PrivacyPolicy() {
  return (
    <>
      <Stack.Screen options={{ title: 'Privacy Policy' }} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
      >
        <Text style={styles.lastUpdated}>Last Updated: January 2026</Text>

        <View style={styles.section}>
          <Text style={styles.heading}>1. Introduction</Text>
          <Text style={styles.paragraph}>
            Genfeed.ai (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;) is
            committed to protecting your privacy. This Privacy Policy explains
            how we collect, use, disclose, and safeguard your information when
            you use our mobile application and services.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.heading}>2. Information We Collect</Text>
          <Text style={styles.subheading}>Personal Information</Text>
          <Text style={styles.paragraph}>
            We may collect personal information that you voluntarily provide,
            including: name, email address, phone number, payment information,
            and profile information.
          </Text>
          <Text style={styles.subheading}>Usage Data</Text>
          <Text style={styles.paragraph}>
            We automatically collect certain information about your device and
            usage, including: device type, operating system, app version, usage
            patterns, and crash reports.
          </Text>
          <Text style={styles.subheading}>Content Data</Text>
          <Text style={styles.paragraph}>
            We store content you create, including ideas, drafts, and generated
            content, to provide our services.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.heading}>3. How We Use Your Information</Text>
          <Text style={styles.paragraph}>
            We use the information we collect to: provide and maintain our
            services; process transactions; send notifications and updates;
            improve our services; respond to support requests; comply with legal
            obligations; and detect and prevent fraud.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.heading}>4. Data Sharing</Text>
          <Text style={styles.paragraph}>
            We may share your information with: service providers who assist in
            operating our platform; payment processors for transaction
            processing; analytics providers to improve our services; and law
            enforcement when required by law. We do not sell your personal
            information to third parties.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.heading}>5. Data Security</Text>
          <Text style={styles.paragraph}>
            We implement appropriate technical and organizational security
            measures to protect your personal information. However, no method of
            transmission over the Internet is 100% secure, and we cannot
            guarantee absolute security.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.heading}>6. Data Retention</Text>
          <Text style={styles.paragraph}>
            We retain your personal information for as long as your account is
            active or as needed to provide services. You may request deletion of
            your data at any time. Certain information may be retained as
            required by law.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.heading}>7. Your Rights</Text>
          <Text style={styles.paragraph}>
            Depending on your location, you may have rights to: access your
            personal data; correct inaccurate data; delete your data; export
            your data; opt-out of marketing communications; and withdraw consent
            for data processing.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.heading}>8. Cookies and Tracking</Text>
          <Text style={styles.paragraph}>
            We use analytics tools to understand how users interact with our
            app. You can manage your privacy preferences in the app settings.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.heading}>9. Children&apos;s Privacy</Text>
          <Text style={styles.paragraph}>
            Our Service is not intended for users under 13 years of age. We do
            not knowingly collect personal information from children under 13.
            If we become aware of such collection, we will delete that
            information.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.heading}>10. International Transfers</Text>
          <Text style={styles.paragraph}>
            Your information may be transferred to and processed in countries
            other than your country of residence. We ensure appropriate
            safeguards are in place for such transfers.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.heading}>11. Changes to This Policy</Text>
          <Text style={styles.paragraph}>
            We may update this Privacy Policy from time to time. We will notify
            you of any changes by posting the new policy on this page and
            updating the &quot;Last Updated&quot; date.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.heading}>12. Contact Us</Text>
          <Text style={styles.paragraph}>
            If you have questions or concerns about this Privacy Policy, please
            contact us at privacy@genfeed.ai.
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
  subheading: {
    color: '#38bdf8',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 12,
  },
});
