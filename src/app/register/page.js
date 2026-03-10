"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Toaster, toast } from "react-hot-toast";

import { registerWithEmail } from "@/lib/firebaseAuth";

import styles from "../login/login.module.css";

export default function RegisterPage() {

  const router = useRouter();

  const [name,setName] = useState("");
  const [email,setEmail] = useState("");
  const [password,setPassword] = useState("");

  const [loading,setLoading] = useState(false);

  const handleRegister = async(e)=>{

    e.preventDefault();

    setLoading(true);

    try{

      await registerWithEmail(name,email,password);

      toast.success("Account created successfully");

      router.replace("/dashboard");

    }catch(err){

      toast.error("Registration failed");

    }

    setLoading(false);

  };

  return(

    <div className={styles.wrapper}>

      <Toaster position="top-right"/>

      <div className={styles.loginCard}>

        <h1 className={styles.title}>Create Account</h1>

        <p className={styles.subtitle}>
          Register to start using dashboard
        </p>

        <form onSubmit={handleRegister}>

          <div className={styles.formGroup}>
            <label className={styles.label}>Name</label>
            <input
              className={styles.input}
              value={name}
              onChange={(e)=>setName(e.target.value)}
              required
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>Email</label>
            <input
              type="email"
              className={styles.input}
              value={email}
              onChange={(e)=>setEmail(e.target.value)}
              required
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>Password</label>
            <input
              type="password"
              className={styles.input}
              value={password}
              onChange={(e)=>setPassword(e.target.value)}
              minLength={6}
              required
            />
          </div>

          <button className={styles.loginBtn}>
            {loading ? "Creating..." : "Register"}
          </button>

        </form>

        <button
          className={styles.switchMode}
          onClick={()=>router.push("/login")}
        >
          Already have an account? Login
        </button>

      </div>

    </div>

  );

}