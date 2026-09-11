import React, { useEffect, useMemo, useState } from 'react';
import { View, Platform } from 'react-native';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeBottomTabNavigator } from '@bottom-tabs/react-navigation';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { onAuthStateChanged } from 'firebase/auth';

import { auth } from './src/firebase';
import { useTheme } from './src/theme';
import TabBar from './src/TabBar';
import CreateMenu from './src/CreateMenu';
import { GLASS } from './src/ButtonFill';
import Splash from './src/Splash';
import { useAdsGate } from './src/ads';
import SignInScreen from './src/screens/SignInScreen';
import HomeScreen from './src/screens/HomeScreen';
import ShortsScreen from './src/screens/ShortsScreen';
import FollowedScreen from './src/screens/FollowedScreen';
import YouScreen from './src/screens/YouScreen';
import ComposePostScreen from './src/screens/ComposePostScreen';
import ComposeVideoScreen from './src/screens/ComposeVideoScreen';
import PlusScreen from './src/screens/PlusScreen';

const Tab = createBottomTabNavigator();
const NativeTab = createNativeBottomTabNavigator();
const Stack = createNativeStackNavigator();

/**
 * Apple's own tab bar on iPhones with Liquid Glass (iOS 26+): the real
 * UITabBar, so it gets the genuine glass capsule, the sliding selection and
 * shrinking on scroll — not a lookalike.
 *
 * Not on iPad, where iPadOS moves the native tab bar to the top of the screen;
 * the bar belongs at the bottom, so iPad keeps Codera's own bar. Android and
 * older iPhones keep it too.
 */
const NATIVE_TABS = Platform.OS === 'ios' && GLASS && !Platform.isPad;

// The Create "tab" never shows a page: pressing it opens the create menu.
const Nothing = () => null;

function Tabs({ navigation }) {
  // Only inside the signed-in app, and it never starts ads for Plus members.
  useAdsGate();
  return NATIVE_TABS ? <GlassTabs navigation={navigation} /> : <CoderaTabs />;
}

function GlassTabs({ navigation }) {
  const T = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);

  const pick = kind => {
    setMenuOpen(false);
    if (kind === 'post') navigation.navigate('ComposePost');
    else navigation.navigate('ComposeVideo', { kind });
  };

  // SF Symbols: Apple's own icons, filled on the page you're on.
  const icon = (outline, filled) => ({ focused }) => ({ sfSymbol: focused ? filled : outline });

  return (
    <>
      <NativeTab.Navigator
        labeled={false}
        minimizeBehavior="onScrollDown"
        hapticFeedbackEnabled
        tabBarActiveTintColor={T.blue}
        screenOptions={{ sceneStyle: { backgroundColor: T.bg } }}
      >
        <NativeTab.Screen name="Home" component={HomeScreen}
          options={{ title: 'Home', tabBarIcon: icon('house', 'house.fill') }} />
        <NativeTab.Screen name="Shorts" component={ShortsScreen}
          options={{ title: 'Shorts', tabBarIcon: icon('play.rectangle', 'play.rectangle.fill') }} />
        <NativeTab.Screen name="Followed" component={FollowedScreen}
          options={{ title: 'Followed', tabBarIcon: icon('person.2', 'person.2.fill') }} />
        <NativeTab.Screen name="You" component={YouScreen}
          options={{ title: 'You', tabBarIcon: icon('person.crop.circle', 'person.crop.circle.fill') }} />
        {/* The + as its own glass circle, set apart at the end of the bar the
            way iOS 26 separates a special tab. It never becomes the current
            page — pressing it opens the create menu. */}
        <NativeTab.Screen name="Create" component={Nothing}
          options={{ title: 'Create', role: 'search', preventsDefault: true, tabBarIcon: () => ({ sfSymbol: 'plus' }) }}
          listeners={{ tabPress: () => setMenuOpen(true) }} />
      </NativeTab.Navigator>
      <CreateMenu native open={menuOpen} onClose={() => setMenuOpen(false)} onPick={pick} />
    </>
  );
}

function CoderaTabs() {
  const T = useTheme();
  return (
    <Tab.Navigator
      // Drawn by hand: no labels, and the + in the middle is an action rather
      // than a tab. Being a plain view pinned to the bottom also means iPadOS
      // cannot relocate it to the top the way it does a real UITabBar.
      tabBar={props => <TabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: T.bg },
        // Slides in from the side the tab sits on, so the direction tells you
        // where you went. Built into the navigator, so it runs natively.
        animation: 'shift',
      }}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Shorts" component={ShortsScreen} />
      <Tab.Screen name="Followed" component={FollowedScreen} />
      <Tab.Screen name="You" component={YouScreen} />
    </Tab.Navigator>
  );
}

export default function App() {
  const T = useTheme();

  // `ready` separates "nobody is signed in" from "Firebase has not answered
  // yet". Without it the sign-in screen flashes on every launch for someone who
  // is already signed in, while the saved session is still being read back.
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [splash, setSplash] = useState(true);

  useEffect(() => onAuthStateChanged(auth, u => {
    setUser(u);
    setReady(true);
  }), []);

  const navTheme = useMemo(() => {
    const base = T.dark ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        background: T.bg, card: T.bg, border: T.border, text: T.text, primary: T.blue,
      },
    };
  }, [T]);

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      {/* The app mounts underneath the splash as soon as sign-in is known, so
          it is already drawn by the time the splash fades off it. */}
      {ready && (
        <SafeAreaProvider>
          {!user ? (
            // Signed out there is no navigator at all, rather than a navigator
            // with guarded screens — so no deep link or back gesture can reach inside.
            <SignInScreen />
          ) : (
            <NavigationContainer theme={navTheme}>
              <Stack.Navigator screenOptions={{ headerShown: false }}>
                <Stack.Screen name="Tabs" component={Tabs} />
                {/* Composing slides up over everything, tab bar included: it is
                    a task you finish or cancel, not a place you navigate around. */}
                <Stack.Group screenOptions={{ presentation: 'modal', animation: 'slide_from_bottom' }}>
                  <Stack.Screen name="ComposePost" component={ComposePostScreen} />
                  <Stack.Screen name="ComposeVideo" component={ComposeVideoScreen} />
                  <Stack.Screen name="Plus" component={PlusScreen} />
                </Stack.Group>
              </Stack.Navigator>
            </NavigationContainer>
          )}
        </SafeAreaProvider>
      )}
      {splash && <Splash ready={ready} onDone={() => setSplash(false)} />}
    </View>
  );
}
