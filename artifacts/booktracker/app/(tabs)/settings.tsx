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

const APPEARANCE_OPTIONS = [
  { id: 'light', labelKey: 'settings.themeLight', swatches: ['#F8F4EE', '#2D6A4F', '#C8873F'] },
  { id: 'dark', labelKey: 'settings.themeDark', swatches: ['#1A1A1C', '#52B788', '#E8A35A'] },
  { id: 'system', labelKey: 'settings.themeSystem', swatches: ['#F8F4EE', '#1A1A1C'] },
  { id: 'dark-academia', labelKey: 'settings.paletteDarkAcademia', swatches: ['#1C1625', '#D4A359', '#8B3A4A'] },
  { id: 'cozy-nook', labelKey: 'settings.paletteCozyNook', swatches: ['#FDFBF7', '#5B7053', '#C27D60'] },
  { id: 'pastel-sunset', labelKey: 'settings.palettePastelSunset', swatches: ['#FAF7FF', '#9A7AA0', '#FF7E95'] },
  { id: 'modern-social', labelKey: 'settings.paletteModernSocial', swatches: ['#0F172A', '#0EA5E9', '#F43F5E'] },
] as const;

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

        {/* Appearance section */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.sectionHeader}>
            <View style={[styles.iconCircle, { backgroundColor: colors.primary + '18' }]}>
              <Feather name="droplet" size={16} color={colors.primary} />
            </View>
            <View style={styles.sectionHeaderText}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                {t('settings.appearanceTitle')}
              </Text>
              <Text style={[styles.sectionDesc, { color: colors.mutedForeground }]}>
                {t('settings.appearanceDesc')}
              </Text>
            </View>
          </View>

          <View style={[styles.row, { borderTopColor: colors.border, flexDirection: 'column', gap: 8 }]}>
            {APPEARANCE_OPTIONS.map((opt) => {
              const active = theme === opt.id || (opt.id === 'system' && !theme);
              return (
                <Pressable
                  key={opt.id}
                  onPress={() => setTheme(opt.id)}
                  style={[
                    styles.paletteRow,
                    {
                      backgroundColor: active ? colors.primary + '14' : 'transparent',
                      borderColor: active ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <View style={styles.paletteSwatches}>
                    {opt.swatches.map((hex, i) => (
                      <View
                        key={i}
                        style={[
                          styles.paletteSwatch,
                          { backgroundColor: hex, marginLeft: i === 0 ? 0 : -6 },
                        ]}
                      />
                    ))}
                  </View>
                  <Text style={[styles.rowLabel, { color: colors.foreground, flex: 1 }]}>
                    {t(opt.labelKey)}
                  </Text>
                  {active && <Feather name="check" size={16} color={colors.primary} />}
                </Pressable>
              );
            })}
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
  paletteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  paletteSwatches: { flexDirection: 'row' },
  paletteSwatch: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },
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
