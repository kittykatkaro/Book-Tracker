import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Link, useRouter } from 'expo-router';
import { useSignIn } from '@clerk/expo';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useTranslation } from 'react-i18next';
import { GoogleSignInButton } from '@/components/GoogleSignInButton';

export default function SignInScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signIn, errors, fetchStatus } = useSignIn();
  const { t } = useTranslation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // errors.global can exist without a usable .message in some cases (e.g.
  // attempting a password sign-in on an account that only has a Google
  // connection and no password) — fall back to a generic message instead
  // of rendering an empty error box.
  const globalErrorMessage = errors?.global
    ? (errors.global.message?.trim() || t('auth.genericError'))
    : null;

  const isLoading = fetchStatus === 'fetching';
  const canSubmit = email.trim().length > 0 && password.length > 0 && !isLoading;

  const handleSubmit = async () => {
    if (!canSubmit) return;

    const { error } = await signIn.password({
      emailAddress: email.trim(),
      password,
    });

    if (error) return;

    if (signIn.status === 'complete') {
      await signIn.finalize({
        navigate: ({ decorateUrl }) => {
          const url = decorateUrl('/');
          if (url.startsWith('http')) {
            window.location.href = url;
          } else {
            router.replace('/(tabs)' as any);
          }
        },
      });
    }
  };

  const s = makeStyles(colors);

  return (
    <KeyboardAvoidingView
      style={[s.root, { backgroundColor: colors.background, paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={s.header}>
          <View style={[s.logoBox, { backgroundColor: colors.primary + '18' }]}>
            <Text style={[s.logoEmoji]}>📚</Text>
          </View>
          <Text style={[s.title, { color: colors.foreground }]}>{t('auth.signInTitle')}</Text>
          <Text style={[s.subtitle, { color: colors.mutedForeground }]}>
            {t('auth.signInSubtitle')}
          </Text>
        </View>

        <View style={s.form}>
          <GoogleSignInButton />

          <View style={s.divider}>
            <View style={[s.dividerLine, { backgroundColor: colors.border }]} />
            <Text style={[s.dividerText, { color: colors.mutedForeground }]}>{t('auth.orDivider')}</Text>
            <View style={[s.dividerLine, { backgroundColor: colors.border }]} />
          </View>

          <View style={s.field}>
            <Text style={[s.label, { color: colors.mutedForeground }]}>{t('auth.emailLabel')}</Text>
            <TextInput
              style={[s.input, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground }]}
              value={email}
              onChangeText={setEmail}
              placeholder={t('auth.emailPlaceholder')}
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              returnKeyType="next"
            />
            {errors?.fields?.identifier && (
              <Text style={s.fieldError}>{errors.fields.identifier.message}</Text>
            )}
          </View>

          <View style={s.field}>
            <Text style={[s.label, { color: colors.mutedForeground }]}>{t('auth.passwordLabel')}</Text>
            <TextInput
              style={[s.input, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground }]}
              value={password}
              onChangeText={setPassword}
              placeholder={t('auth.passwordPlaceholder')}
              placeholderTextColor={colors.mutedForeground}
              secureTextEntry
              autoComplete="password"
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
            />
            {errors?.fields?.password && (
              <Text style={s.fieldError}>{errors.fields.password.message}</Text>
            )}
          </View>

          {globalErrorMessage && (
            <View style={[s.errorBox, { backgroundColor: '#E55A4E18', borderColor: '#E55A4E40' }]}>
              <Text style={[s.errorBoxText, { color: '#E55A4E' }]}>{globalErrorMessage}</Text>
            </View>
          )}

          <Pressable
            style={[s.submitBtn, { backgroundColor: canSubmit ? colors.primary : colors.muted }]}
            onPress={handleSubmit}
            disabled={!canSubmit}
            data-testid="button-sign-in"
          >
            {isLoading ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <Text style={[s.submitBtnText, { color: colors.primaryForeground }]}>
                {t('auth.signIn')}
              </Text>
            )}
          </Pressable>

          <View style={s.footer}>
            <Text style={[s.footerText, { color: colors.mutedForeground }]}>
              {t('auth.noAccount')}{' '}
            </Text>
            <Link href="/(auth)/sign-up" asChild>
              <Pressable>
                <Text style={[s.footerLink, { color: colors.primary }]}>{t('auth.signUp')}</Text>
              </Pressable>
            </Link>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function makeStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    root: { flex: 1 },
    scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24 },
    header: { alignItems: 'center', marginBottom: 36 },
    logoBox: {
      width: 72, height: 72, borderRadius: 20,
      alignItems: 'center', justifyContent: 'center', marginBottom: 20,
    },
    logoEmoji: { fontSize: 34 },
    title: { fontSize: 28, fontFamily: 'Inter_600SemiBold', marginBottom: 6, textAlign: 'center' },
    subtitle: { fontSize: 15, fontFamily: 'Inter_400Regular', textAlign: 'center' },
    form: { gap: 16 },
    field: { gap: 6 },
    label: { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.7 },
    input: {
      borderWidth: 1, borderRadius: 12,
      paddingHorizontal: 14, paddingVertical: 13,
      fontSize: 15, fontFamily: 'Inter_400Regular',
    },
    fieldError: { fontSize: 12, color: '#E55A4E', fontFamily: 'Inter_400Regular' },
    divider: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 2 },
    dividerLine: { flex: 1, height: 1 },
    dividerText: { fontSize: 12, fontFamily: 'Inter_500Medium' },
    errorBox: { borderWidth: 1, borderRadius: 10, padding: 12 },
    errorBoxText: { fontSize: 13, fontFamily: 'Inter_400Regular' },
    submitBtn: {
      height: 50, borderRadius: 25,
      alignItems: 'center', justifyContent: 'center',
      marginTop: 4,
    },
    submitBtnText: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
    footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 8 },
    footerText: { fontSize: 14, fontFamily: 'Inter_400Regular' },
    footerLink: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  });
}
