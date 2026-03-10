import {
 collection,
 addDoc,
 query,
 where,
 getDocs,
 serverTimestamp,
 updateDoc,
 doc
} from "firebase/firestore";

import { db } from "./firebase";

/* search user */

export const searchUserByEmail = async (email) => {

 const q = query(
  collection(db,"users"),
  where("email","==",email)
 );

 const snap = await getDocs(q);

 if(snap.empty) return null;

 return { id:snap.docs[0].id,...snap.docs[0].data() };

};

/* send request */

export const sendChatRequest = async (fromUserId,toUserId)=>{

 await addDoc(collection(db,"chatRequests"),{
  fromUserId,
  toUserId,
  status:"pending",
  createdAt:serverTimestamp()
 });

};

/* accept request */

export const acceptRequest = async(requestId,user1,user2)=>{

 await updateDoc(doc(db,"chatRequests",requestId),{
  status:"accepted"
 });

 await addDoc(collection(db,"chats"),{
  participants:[user1,user2],
  createdAt:serverTimestamp()
 });

};