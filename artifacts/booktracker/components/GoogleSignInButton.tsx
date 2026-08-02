import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { useSSO } from '@clerk/expo';
import { useTranslation } from 'react-i18next';
import { useColors } from '@/hooks/useColors';

// Required once per app so the browser-based auth session can resolve
// back to Clerk when the OAuth flow redirects back into the app.
WebBrowser.maybeCompleteAuthSession();

export function GoogleSignInButton() {
  const { startSSOFlow } = useSSO();
  const { t } = useTranslation();
  const colors = useColors();
  const [loading, setLoading] = useState(false);

  // Pre-warms the in-app browser on Android so the OAuth screen opens
  // faster; harmless no-op on iOS.
  useEffect(() => {
    WebBrowser.warmUpAsync();
    return () => {
      WebBrowser.coolDownAsync();
    };
  }, []);

  const handlePress = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const { createdSessionId, setActive } = await startSSOFlow({
        strategy: 'oauth_google',
        redirectUrl: Linking.createURL('/sso-callback'),
      });
      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
      }
      // If createdSessionId is missing, the flow was cancelled or needs
      // an extra step Clerk didn't resolve automatically — nothing to do
      // here; the user just stays on the sign-in screen.
    } catch (err) {
      console.error('[GoogleSignInButton] SSO flow failed:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={loading}
      style={[styles.button, { borderColor: colors.border, backgroundColor: colors.card }]}
      data-testid="button-google-sign-in"
    >
      {loading ? (
        <ActivityIndicator color={colors.foreground} />
      ) : (
        <>
          <Text style={styles.googleG}>G</Text>
          <Text style={[styles.text, { color: colors.foreground }]}>
            {t('auth.continueWithGoogle')}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 50,
    borderRadius: 25,
    borderWidth: 1,
  },
  googleG: { fontSize: 18, fontFamily: 'Inter_700Bold', color: '#4285F4' },
  text: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
});
