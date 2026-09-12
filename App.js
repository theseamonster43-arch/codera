import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { useProfile } from './src/profile';
import SignInScreen from './src/screens/SignInScreen';
import ChooseNameScreen from './src/screens/ChooseNameScreen';
import HomeScreen from './src/screens/HomeScreen';
import ShortsScreen from './src/screens/ShortsScreen';
import FollowedScreen from './src/screens/FollowedScreen';
import YouScreen from './src/screens/YouScreen';
import ComposePostScreen from './src/screens/ComposePostScreen';
import ComposeVideoScreen from './src/screens/ComposeVideoScreen';
import PlusScreen from './src/screens/PlusScreen';
import CommentsScreen from './src/screens/CommentsScreen';

const Tab = createBottomTabNavigator();
const NativeTab = createNativeBottomTabNavigator();
const Stack = createNativeStackNavigator();

/**
 * Apple's own tab bar wherever iOS has Liquid Glass (iOS 26+), iPhone and iPad:
 * the real UITabBar, so it gets the genuine glass capsule, the sliding selection
 * and shrinking on scroll — not a lookalike.
 *
 * iPadOS would normally move that bar to the top of the screen; a patch to
 * react-native-bottom-tabs (patches/) keeps it at the bottom on iPad, like
 * iPhone. Android and older iOS keep Codera's own bar.
 */
const NATIVE_TABS = Platform.OS === 'ios' && GLASS;

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

  // The native bar reports a tab press of its own while it is settling in, which
  // would open the create menu the moment the app starts. Presses are only taken
  // as real once the bar has been on screen for a moment.
  const ready = useRef(false);
  useEffect(() => {
    const t = setTimeout(() => { ready.current = true; }, 800);
    return () => clearTimeout(t);
  }, []);

  const pick = kind => {
    setMenuOpen(false);
    if (kind === 'post') navigation.navigate('ComposePost');
    else navigation.navigate('ComposeVideo', { kind });
  };

  // Codera's own icons rather than Apple's SF Symbols: PNGs of the very
  // drawings in src/Icons.js. They are template images, so iOS tints them, and
  // the filled one marks the page you're on.
  const ICON = {
    Home: [require('./assets/tabicons/home.png'), require('./assets/tabicons/home-filled.png')],
    Shorts: [require('./assets/tabicons/shorts.png'), require('./assets/tabicons/shorts-filled.png')],
    Create: [require('./assets/tabicons/plus.png'), require('./assets/tabicons/plus.png')],
    Followed: [require('./assets/tabicons/followed.png'), require('./assets/tabicons/followed-filled.png')],
    You: [require('./assets/tabicons/you.png'), require('./assets/tabicons/you-filled.png')],
  };
  const icon = name => ({ focused }) => ICON[name][focused ? 1 : 0];

  // Apple's tab bar floats above everything, the create menu included, so a tab
  // could be pressed straight through the open menu. The bar goes away while
  // the menu is up, and any press that does land closes the menu first.
  const closeMenu = { tabPress: () => setMenuOpen(false) };

  return (
    <>
      <NativeTab.Navigator
        labeled={false}
        minimizeBehavior="onScrollDown"
        hapticFeedbackEnabled
        tabBarHidden={menuOpen}
        tabBarActiveTintColor={T.blue}
        screenOptions={{ sceneStyle: { backgroundColor: T.bg } }}
      >
        <NativeTab.Screen name="Home" component={HomeScreen} listeners={closeMenu}
          options={{ title: 'Home', tabBarIcon: icon('Home') }} />
        <NativeTab.Screen name="Shorts" component={ShortsScreen} listeners={closeMenu}
          options={{ title: 'Shorts', tabBarIcon: icon('Shorts') }} />
        {/* In the middle with the rest, not set apart: it is one of the bar's
            items, it just opens the create menu instead of changing page. */}
        <NativeTab.Screen name="Create" component={Nothing}
          options={{ title: 'Create', preventsDefault: true, tabBarIcon: icon('Create') }}
          listeners={{ tabPress: () => { if (ready.current) setMenuOpen(true); } }} />
        <NativeTab.Screen name="Followed" component={FollowedScreen} listeners={closeMenu}
          options={{ title: 'Followed', tabBarIcon: icon('Followed') }} />
        <NativeTab.Screen name="You" component={YouScreen} listeners={closeMenu}
          options={{ title: 'You', tabBarIcon: icon('You') }} />
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

  // Everyone has a username. Accounts made before there were any are asked for
  // one the next time they open Codera, and there is no way past the question.
  const profile = useProfile(user);
  const named = !user || (profile.loaded && !!profile.username);

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
          ) : !named ? (
            <ChooseNameScreen />
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
                  <Stack.Screen name="Comments" component={CommentsScreen} />
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
