import React, { useEffect, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useUser, useClerk } from '@clerk/expo';
import { useTranslation } from 'react-i18next';
import { setLanguage } from '@/i18n';
import { useColors } from '@/hooks/useColors';
import { useTheme } from '@/context/ThemeContext';
import { Feather } from '@expo/vector-icons';

export default function SettingsScreen() {
  const { t, i18n } = useTranslation();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useUser();
  const { signOut } = useClerk();
  const { theme, setTheme } = useTheme();

  const bannerKey = user?.id ? `banner_dismissed_${user.id}` : null;
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [bannerResetDone, setBannerResetDone] = useState(false);

  useEffect(() => {
    if (!bannerKey) return;
    AsyncStorage.getItem(bannerKey).then((value) => {
      setBannerDismissed(value === 'true');
    });
  }, [bannerKey]);

  const handleResetBanner = async () => {
    if (bannerKey) await AsyncStorage.removeItem(bannerKey);
    setBannerDismissed(false);
    setBannerResetDone(true);
    setTimeout(() => setBannerResetDone(false), 2000);
  };

  const currentLang = i18n.language.startsWith('de') ? 'de' : 'en';
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.background }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>
          {t('settings.title')}
        </Text>
        <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>
          {t('settings.subtitle')}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: (Platform.OS === 'web' ? 34 : insets.bottom) + 20 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Onboarding section */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.sectionHeader}>
            <View style={[styles.iconCircle, { backgroundColor: colors.primary + '18' }]}>
              <Feather name="star" size={16} color={colors.primary} />
            </View>
            <View style={styles.sectionHeaderText}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                {t('settings.onboardingTitle')}
              </Text>
              <Text style={[styles.sectionDesc, { color: colors.mutedForeground }]}>
                {t('settings.onboardingDesc')}
              </Text>
            </View>
          </View>

          <View style={[styles.row, { borderTopColor: colors.border }]}>
            <View style={styles.rowLeft}>
              <Text style={[styles.rowLabel, { color: colors.foreground }]}>
                {t('settings.welcomeBanner')}
              </Text>
              <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>
                {t('settings.welcomeBannerDesc')}
              </Text>
            </View>
            {bannerDismissed ? (
              <Pressable
                onPress={handleResetBanner}
                style={[
                  styles.pill,
                  { backgroundColor: colors.secondary, borderColor: colors.border },
                ]}
              >
                <Feather
                  name={bannerResetDone ? 'check' : 'rotate-ccw'}
                  size={12}
                  color={bannerResetDone ? '#22c55e' : colors.mutedForeground}
                />
                <Text style={[styles.pillText, { color: colors.mutedForeground }]}>
                  {bannerResetDone ? t('settings.resetDone') : t('settings.resetBanner')}
                </Text>
              </Pressable>
            ) : (
              <View style={[styles.badge, { backgroundColor: colors.secondary }]}>
                <Text style={[styles.badgeText, { color: colors.mutedForeground }]}>
                  {t('settings.bannerVisible')}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Theme section */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.sectionHeader}>
            <View style={[styles.iconCircle, { backgroundColor: colors.primary + '18' }]}>
              <Feather name={theme === 'dark' ? 'moon' : 'sun'} size={16} color={colors.primary} />
            </View>
            <View style={styles.sectionHeaderText}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                {t('settings.themeTitle')}
              </Text>
              <Text style={[styles.sectionDesc, { color: colors.mutedForeground }]}>
                {t('settings.themeDesc')}
              </Text>
            </View>
          </View>

          <View style={[styles.row, { borderTopColor: colors.border }]}>
            <View style={styles.langButtons}>
              {(['light', 'dark', 'system'] as const).map((mode) => {
                const active = theme === mode;
                const labelKey = mode === 'system' ? 'settings.themeSystem' : `settings.theme${mode.charAt(0).toUpperCase() + mode.slice(1)}`;
                return (
                  <Pressable
                    key={mode}
                    onPress={() => setTheme(mode)}
                    style={[
                      styles.langBtn,
                      {
                        backgroundColor: active ? colors.primary : colors.secondary,
                        borderColor: active ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.langBtnText,
                        { color: active ? colors.primaryForeground : colors.mutedForeground },
                      ]}
                    >
                      {t(labelKey)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>

        {/* Language section */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.sectionHeader}>
            <View style={[styles.iconCircle, { backgroundColor: colors.primary + '18' }]}>
              <Feather name="globe" size={16} color={colors.primary} />
            </View>
            <View style={styles.sectionHeaderText}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                {t('settings.languageTitle')}
              </Text>
              <Text style={[styles.sectionDesc, { color: colors.mutedForeground }]}>
                {t('settings.languageDesc')}
              </Text>
            </View>
          </View>

          <View style={[styles.row, { borderTopColor: colors.border }]}>
            <View style={styles.langButtons}>
              <Pressable
                onPress={() => setLanguage('en')}
                style={[
                  styles.langBtn,
                  {
                    backgroundColor: currentLang === 'en' ? colors.primary : colors.secondary,
                    borderColor: currentLang === 'en' ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.langBtnText,
                    { color: currentLang === 'en' ? colors.primaryForeground : colors.mutedForeground },
                  ]}
                >
                  English
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setLanguage('de')}
                style={[
                  styles.langBtn,
                  {
                    backgroundColor: currentLang === 'de' ? colors.primary : colors.secondary,
                    borderColor: currentLang === 'de' ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.langBtnText,
                    { color: currentLang === 'de' ? colors.primaryForeground : colors.mutedForeground },
                  ]}
                >
                  Deutsch
                </Text>
              </Pressable>
            </View>
          </View>
        </View>

        {/* Notifications — placeholder */}
        <View style={[styles.section, styles.sectionMuted, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.sectionHeader}>
            <View style={[styles.iconCircle, { backgroundColor: colors.muted }]}>
              <Feather name="bell" size={16} color={colors.mutedForeground} />
            </View>
            <View style={styles.sectionHeaderText}>
              <View style={styles.titleRow}>
                <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>
                  {t('settings.notificationsTitle')}
                </Text>
                <View style={[styles.badge, { backgroundColor: colors.secondary }]}>
                  <Text style={[styles.badgeText, { color: colors.mutedForeground }]}>
                    {t('settings.comingSoon')}
                  </Text>
                </View>
              </View>
              <Text style={[styles.sectionDesc, { color: colors.mutedForeground }]}>
                {t('settings.notificationsDesc')}
              </Text>
            </View>
          </View>
        </View>

        {/* Sign out */}
        <Pressable
          onPress={() => signOut()}
          style={[styles.signOutBtn, { borderTopColor: colors.border }]}
        >
          <Feather name="log-out" size={16} color={colors.mutedForeground} />
          <Text style={[styles.signOutText, { color: colors.mutedForeground }]}>
            {t('settings.signOut')}
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  headerTitle: { fontSize: 28, fontFamily: 'Inter_700Bold', lineHeight: 34 },
  headerSub: { fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 2 },
  content: { paddingHorizontal: 16, paddingTop: 8, gap: 12 },
  section: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  sectionMuted: { opacity: 0.6 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 16,
  },
  iconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  sectionHeaderText: { flex: 1 },
  sectionTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold', lineHeight: 20 },
  sectionDesc: { fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 2, lineHeight: 18 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  row: {
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  rowLeft: { flex: 1 },
  rowLabel: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  rowSub: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  pillText: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  badgeText: { fontSize: 11, fontFamily: 'Inter_500Medium' },
  langButtons: { flexDirection: 'row', gap: 8 },
  langBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  langBtnText: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 16,
    borderTopWidth: 1,
    marginTop: 4,
  },
  signOutText: { fontSize: 14, fontFamily: 'Inter_400Regular' },
});
