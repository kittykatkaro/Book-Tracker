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
import { useSignUp } from '@clerk/expo';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';

export default function SignUpScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signUp, errors, fetchStatus } = useSignUp();

  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');

  const isLoading = fetchStatus === 'fetching';
  const verifying =
    signUp.status === 'missing_requirements' &&
    signUp.unverifiedFields?.includes('email_address') &&
    signUp.missingFields?.length === 0;

  const canSubmit =
    email.trim().length > 0 && password.length >= 8 && !isLoading;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    const nameParts = name.trim().split(' ');
    const firstName = nameParts[0] ?? '';
    const lastName = nameParts.slice(1).join(' ') || undefined;

    const { error } = await signUp.password({
      emailAddress: email.trim(),
      password,
      ...(username.trim() ? { username: username.trim() } : {}),
      ...(firstName ? { firstName } : {}),
      ...(lastName ? { lastName } : {}),
    } as any);

    if (error) return;
    await signUp.verifications.sendEmailCode();
  };

  const handleVerify = async () => {
    if (!code.trim() || isLoading) return;
    await signUp.verifications.verifyEmailCode({ code });

    if (signUp.status === 'complete') {
      await signUp.finalize({
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

  // ---- Verification screen ----
  if (verifying) {
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
              <Text style={s.logoEmoji}>✉️</Text>
            </View>
            <Text style={[s.title, { color: colors.foreground }]}>Check your email</Text>
            <Text style={[s.subtitle, { color: colors.mutedForeground }]}>
              We sent a 6-digit code to{'\n'}
              <Text style={{ color: colors.primary }}>{email}</Text>
            </Text>
          </View>

          <View style={s.form}>
            <View style={s.field}>
              <Text style={[s.label, { color: colors.mutedForeground }]}>VERIFICATION CODE</Text>
              <TextInput
                style={[s.input, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground, letterSpacing: 6, textAlign: 'center', fontSize: 20 }]}
                value={code}
                onChangeText={setCode}
                placeholder="000000"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="number-pad"
                maxLength={6}
                returnKeyType="done"
                onSubmitEditing={handleVerify}
              />
              {errors?.fields?.code && (
                <Text style={s.fieldError}>{errors.fields.code.message}</Text>
              )}
            </View>

            {errors?.global && (
              <View style={[s.errorBox, { backgroundColor: '#E55A4E18', borderColor: '#E55A4E40' }]}>
                <Text style={[s.errorBoxText, { color: '#E55A4E' }]}>{errors.global.message}</Text>
              </View>
            )}

            <Pressable
              style={[s.submitBtn, { backgroundColor: code.length === 6 && !isLoading ? colors.primary : colors.muted }]}
              onPress={handleVerify}
              disabled={code.length !== 6 || isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color={colors.primaryForeground} />
              ) : (
                <Text style={[s.submitBtnText, { color: colors.primaryForeground }]}>Verify email</Text>
              )}
            </Pressable>

            <Pressable
              style={s.resendBtn}
              onPress={() => signUp.verifications.sendEmailCode()}
              disabled={isLoading}
            >
              <Text style={[s.resendText, { color: colors.primary }]}>Resend code</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ---- Sign-up form ----
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
            <Text style={s.logoEmoji}>📚</Text>
          </View>
          <Text style={[s.title, { color: colors.foreground }]}>Start your library</Text>
          <Text style={[s.subtitle, { color: colors.mutedForeground }]}>
            Create an account to track your books
          </Text>
        </View>

        <View style={s.form}>
          <View style={s.field}>
            <Text style={[s.label, { color: colors.mutedForeground }]}>USERNAME</Text>
            <TextInput
              style={[s.input, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground }]}
              value={username}
              onChangeText={setUsername}
              placeholder="bookworm42"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
            />
            {errors?.fields?.username && (
              <Text style={s.fieldError}>{errors.fields.username.message}</Text>
            )}
          </View>

          <View style={s.field}>
            <Text style={[s.label, { color: colors.mutedForeground }]}>FULL NAME</Text>
            <TextInput
              style={[s.input, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground }]}
              value={name}
              onChangeText={setName}
              placeholder="Jane Austen"
              placeholderTextColor={colors.mutedForeground}
              autoComplete="name"
              returnKeyType="next"
            />
            {errors?.fields?.firstName && (
              <Text style={s.fieldError}>{errors.fields.firstName.message}</Text>
            )}
          </View>

          <View style={s.field}>
            <Text style={[s.label, { color: colors.mutedForeground }]}>EMAIL</Text>
            <TextInput
              style={[s.input, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground }]}
              value={email}
              onChangeText={setEmail}
              placeholder="your@email.com"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              returnKeyType="next"
            />
            {errors?.fields?.emailAddress && (
              <Text style={s.fieldError}>{errors.fields.emailAddress.message}</Text>
            )}
          </View>

          <View style={s.field}>
            <Text style={[s.label, { color: colors.mutedForeground }]}>PASSWORD</Text>
            <TextInput
              style={[s.input, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground }]}
              value={password}
              onChangeText={setPassword}
              placeholder="At least 8 characters"
              placeholderTextColor={colors.mutedForeground}
              secureTextEntry
              autoComplete="new-password"
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
            />
            {errors?.fields?.password && (
              <Text style={s.fieldError}>{errors.fields.password.message}</Text>
            )}
          </View>

          {errors?.global && (
            <View style={[s.errorBox, { backgroundColor: '#E55A4E18', borderColor: '#E55A4E40' }]}>
              <Text style={[s.errorBoxText, { color: '#E55A4E' }]}>{errors.global.message}</Text>
            </View>
          )}

          <Pressable
            style={[s.submitBtn, { backgroundColor: canSubmit ? colors.primary : colors.muted }]}
            onPress={handleSubmit}
            disabled={!canSubmit}
            data-testid="button-sign-up"
          >
            {isLoading ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <Text style={[s.submitBtnText, { color: colors.primaryForeground }]}>
                Create account
              </Text>
            )}
          </Pressable>

          {/* Required for Clerk bot protection */}
          <View nativeID="clerk-captcha" />

          <View style={s.footer}>
            <Text style={[s.footerText, { color: colors.mutedForeground }]}>
              Already have an account?{' '}
            </Text>
            <Link href="/(auth)/sign-in" asChild>
              <Pressable>
                <Text style={[s.footerLink, { color: colors.primary }]}>Sign in</Text>
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
    header: { alignItems: 'center', marginBottom: 32 },
    logoBox: {
      width: 72, height: 72, borderRadius: 20,
      alignItems: 'center', justifyContent: 'center', marginBottom: 20,
    },
    logoEmoji: { fontSize: 34 },
    title: { fontSize: 26, fontFamily: 'Inter_600SemiBold', marginBottom: 6, textAlign: 'center' },
    subtitle: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 22 },
    form: { gap: 14 },
    field: { gap: 6 },
    label: { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.7 },
    input: {
      borderWidth: 1, borderRadius: 12,
      paddingHorizontal: 14, paddingVertical: 13,
      fontSize: 15, fontFamily: 'Inter_400Regular',
    },
    fieldError: { fontSize: 12, color: '#E55A4E', fontFamily: 'Inter_400Regular' },
    errorBox: { borderWidth: 1, borderRadius: 10, padding: 12 },
    errorBoxText: { fontSize: 13, fontFamily: 'Inter_400Regular' },
    submitBtn: {
      height: 50, borderRadius: 25,
      alignItems: 'center', justifyContent: 'center',
      marginTop: 4,
    },
    submitBtnText: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
    resendBtn: { alignItems: 'center', paddingVertical: 8 },
    resendText: { fontSize: 14, fontFamily: 'Inter_500Medium' },
    footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 4 },
    footerText: { fontSize: 14, fontFamily: 'Inter_400Regular' },
    footerLink: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  });
}
