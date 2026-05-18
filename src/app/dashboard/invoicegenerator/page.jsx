"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { db, auth } from "@/firebase/firebase";
import {
  addDoc,
  collection,
  serverTimestamp,
} from "firebase/firestore";

import {
  onAuthStateChanged,
} from "firebase/auth";

import jsPDF from "jspdf";

export default function ImageToPDFPage() {

  const fileRef = useRef();

  const [user, setUser] = useState(null);

  const [loading, setLoading] = useState(false);

  const [popup, setPopup] = useState(false);

  const [images, setImages] = useState([]);

  const [history, setHistory] = useState([]);

  const [settings, setSettings] = useState({
    fileName: "my-document",
    pageSize: "fit",
    quality: 90,
    background: "#ffffff",
    watermark: "",
    pageNumbers: false,
  });

  // USER FETCH
  useEffect(() => {

    const unsub = onAuthStateChanged(auth, (u) => {

      if (u) {

        setUser({
          uid: u.uid,
          name: u.displayName || "MyDashboard User",
          email: u.email,
        });

      }

    });

    return () => unsub();

  }, []);

  // POPUP
  useEffect(() => {

    if (images.length > 0) {

      const timer = setTimeout(() => {
        setPopup(true);
      }, 5000);

      return () => clearTimeout(timer);

    }

  }, [images]);

  // IMAGE UPLOAD
  const handleImages = (e) => {

    const files = Array.from(e.target.files);

    const mapped = files.map((file, index) => ({
      id: index + Date.now(),
      file,
      url: URL.createObjectURL(file),
      name: file.name,
      size: file.size,
    }));

    setImages(mapped);

  };

  // TOTAL SIZE
  const totalSize = useMemo(() => {

    return (
      images.reduce((acc, item) => acc + item.size, 0) /
      1024 /
      1024
    ).toFixed(2);

  }, [images]);

  // CONVERT PDF
  const createPDF = async () => {

    try {

      if (images.length === 0) {
        return alert("Please upload images");
      }

      setLoading(true);

      const pdf = new jsPDF();

      for (let i = 0; i < images.length; i++) {

        const img = images[i];

        const image = new Image();

        image.src = img.url;

        await new Promise((resolve) => {

          image.onload = () => {

            const width = pdf.internal.pageSize.getWidth();

            const height =
              (image.height * width) / image.width;

            if (i !== 0) {
              pdf.addPage();
            }

            // BACKGROUND
            pdf.setFillColor(settings.background);
            pdf.rect(
              0,
              0,
              width,
              pdf.internal.pageSize.getHeight(),
              "F"
            );

            pdf.addImage(
              image,
              "JPEG",
              0,
              0,
              width,
              height,
              "",
              "FAST"
            );

            // WATERMARK
            if (settings.watermark) {

              pdf.setTextColor(180);

              pdf.setFontSize(30);

              pdf.text(
                settings.watermark,
                width / 2,
                140,
                {
                  angle: 45,
                  align: "center",
                }
              );
            }

            // PAGE NUMBERS
            if (settings.pageNumbers) {

              pdf.setFontSize(10);

              pdf.text(
                `Page ${i + 1}`,
                width - 20,
                pdf.internal.pageSize.getHeight() - 10
              );

            }

            resolve();

          };

        });

      }

      pdf.save(`${settings.fileName}.pdf`);

      // SAVE FIREBASE
      await addDoc(collection(db, "pdf_history"), {

        uid: user?.uid || "",
        userName: user?.name || "",
        email: user?.email || "",

        fileName: settings.fileName,
        images: images.length,
        totalSize,

        createdAt: serverTimestamp(),

      });

      // LOCAL HISTORY
      setHistory((prev) => [
        {
          fileName: settings.fileName,
          images: images.length,
          totalSize,
          date: new Date().toLocaleString(),
        },
        ...prev,
      ]);

      alert("PDF Created Successfully");

    } catch (err) {

      console.log(err);

      alert("Something went wrong");

    } finally {

      setLoading(false);

    }

  };

  return (

    <div className="min-h-screen bg-[#f4f6ff]">

      {/* HEADER */}

      <div className="h-[70px] border-b bg-white flex items-center justify-between px-6">

        <div className="flex items-center gap-4">

          <button
            className="w-10 h-10 rounded-xl border flex items-center justify-center"
          >
            ←
          </button>

          <div className="flex items-center gap-3">

            <div className="w-12 h-12 rounded-2xl bg-[#4f5fff] flex items-center justify-center text-white font-bold">
              📄
            </div>

            <div>

              <h1 className="text-3xl font-black text-[#1a1d44]">
                Image→PDF
              </h1>

              <p className="text-sm text-gray-400">
                MyDashboard Tools
              </p>

            </div>

          </div>

        </div>

        <div className="bg-[#eef1ff] px-5 py-2 rounded-2xl">

          <span className="text-[#4f5fff] font-semibold">
            {user?.name || "Loading..."}
          </span>

        </div>

      </div>

      {/* MAIN */}

      <div className="grid grid-cols-[320px_1fr_300px] min-h-[calc(100vh-70px)]">

        {/* LEFT */}

        <div className="border-r bg-white p-5">

          <div className="flex items-center justify-between mb-5">

            <h2 className="font-bold text-[#4f5fff]">
              IMAGES ({images.length})
            </h2>

            <button
              onClick={() => fileRef.current.click()}
              className="bg-[#4f5fff] text-white px-4 py-2 rounded-xl font-semibold"
            >
              + Add
            </button>

          </div>

          <input
            type="file"
            multiple
            hidden
            ref={fileRef}
            accept="image/*"
            onChange={handleImages}
          />

          {/* DROP */}

          <div
            onClick={() => fileRef.current.click()}
            className="border-2 border-dashed border-[#ccd3ff] rounded-3xl h-[300px] flex flex-col items-center justify-center cursor-pointer hover:bg-[#f7f8ff] transition"
          >

            <div className="text-6xl mb-4">
              🖼️
            </div>

            <h2 className="font-bold text-xl text-[#1a1d44]">
              Drop images here
            </h2>

            <p className="text-gray-400 mt-2">
              or click to browse
            </p>

            <div className="mt-4 text-xs text-[#4f5fff]">
              PNG • JPG • WEBP • BMP
            </div>

          </div>

          {/* PREVIEW */}

          <div className="mt-6 space-y-3 max-h-[400px] overflow-auto">

            {images.map((img) => (

              <div
                key={img.id}
                className="bg-[#f7f8ff] rounded-2xl p-3 flex items-center gap-3"
              >

                <img
                  src={img.url}
                  className="w-16 h-16 object-cover rounded-xl"
                />

                <div className="flex-1">

                  <p className="font-semibold text-sm truncate">
                    {img.name}
                  </p>

                  <p className="text-xs text-gray-400">
                    {(img.size / 1024).toFixed(1)} KB
                  </p>

                </div>

              </div>

            ))}

          </div>

        </div>

        {/* CENTER */}

        <div className="p-8">

          <h2 className="text-3xl font-black text-[#1a1d44] mb-8">
            ⚙ PDF Settings
          </h2>

          <div className="space-y-8">

            {/* FILE NAME */}

            <div>

              <label className="block mb-3 font-semibold text-[#1a1d44]">
                OUTPUT FILE NAME
              </label>

              <div className="flex items-center">

                <input
                  value={settings.fileName}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      fileName: e.target.value,
                    })
                  }
                  className="flex-1 h-14 rounded-2xl border border-[#dfe4ff] px-5 outline-none"
                />

                <span className="ml-3 text-[#9aa4ff] font-semibold">
                  .pdf
                </span>

              </div>

            </div>

            {/* PAGE SIZE */}

            <div>

              <label className="block mb-3 font-semibold text-[#1a1d44]">
                PAGE SIZE
              </label>

              <div className="flex gap-3 flex-wrap">

                {[
                  "fit",
                  "A4",
                  "A3",
                  "LETTER",
                  "LEGAL",
                ].map((item) => (

                  <button
                    key={item}
                    onClick={() =>
                      setSettings({
                        ...settings,
                        pageSize: item,
                      })
                    }
                    className={`px-5 py-3 rounded-2xl font-semibold transition ${
                      settings.pageSize === item
                        ? "bg-[#4f5fff] text-white"
                        : "bg-white border"
                    }`}
                  >
                    {item}
                  </button>

                ))}

              </div>

            </div>

            {/* QUALITY */}

            <div>

              <div className="flex justify-between mb-3">

                <label className="font-semibold text-[#1a1d44]">
                  IMAGE QUALITY
                </label>

                <span className="text-[#4f5fff] font-bold">
                  {settings.quality}%
                </span>

              </div>

              <input
                type="range"
                min={10}
                max={100}
                value={settings.quality}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    quality: e.target.value,
                  })
                }
                className="w-full"
              />

            </div>

            {/* BACKGROUND */}

            <div>

              <label className="block mb-3 font-semibold text-[#1a1d44]">
                BACKGROUND
              </label>

              <div className="flex gap-4">

                {[
                  "#ffffff",
                  "#000000",
                  "#f5f5dc",
                  "#eef2ff",
                  "#1a1d44",
                ].map((color) => (

                  <button
                    key={color}
                    onClick={() =>
                      setSettings({
                        ...settings,
                        background: color,
                      })
                    }
                    style={{
                      background: color,
                    }}
                    className={`w-12 h-12 rounded-full border-4 ${
                      settings.background === color
                        ? "border-[#4f5fff]"
                        : "border-white"
                    }`}
                  />

                ))}

              </div>

            </div>

            {/* WATERMARK */}

            <div>

              <label className="block mb-3 font-semibold text-[#1a1d44]">
                WATERMARK
              </label>

              <input
                value={settings.watermark}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    watermark: e.target.value,
                  })
                }
                placeholder="CONFIDENTIAL"
                className="w-full h-14 rounded-2xl border border-[#dfe4ff] px-5 outline-none"
              />

            </div>

            {/* PAGE NUMBER */}

            <div className="flex items-center gap-3">

              <input
                type="checkbox"
                checked={settings.pageNumbers}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    pageNumbers: e.target.checked,
                  })
                }
              />

              <span className="font-semibold">
                Add Page Numbers
              </span>

            </div>

            {/* BUTTON */}

            <button
              onClick={createPDF}
              disabled={loading}
              className="w-full h-16 rounded-2xl bg-[#7b89ff] hover:bg-[#5b6dff] transition text-white text-xl font-bold shadow-lg"
            >
              {loading
                ? "Creating PDF..."
                : "📄 Convert to PDF"}
            </button>

          </div>

        </div>

        {/* RIGHT */}

        <div className="border-l bg-white">

          <div className="p-5 border-b">

            <h2 className="font-black text-[#4f5fff] text-xl">
              HISTORY
            </h2>

          </div>

          <div className="overflow-auto h-[calc(100vh-120px)]">

            {history.map((item, index) => (

              <div
                key={index}
                className="p-5 border-b hover:bg-[#f8f9ff]"
              >

                <div className="flex gap-4">

                  <div className="text-3xl">
                    📄
                  </div>

                  <div>

                    <h3 className="font-bold text-[#1a1d44]">
                      {item.fileName}
                    </h3>

                    <p className="text-sm text-[#7b89ff] mt-1">
                      {item.images} images • {item.totalSize} MB
                    </p>

                    <p className="text-xs text-gray-400 mt-2">
                      {item.date}
                    </p>

                  </div>

                </div>

              </div>

            ))}

          </div>

        </div>

      </div>

      {/* POPUP */}

      {popup && (

        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">

          <div className="bg-white w-[420px] rounded-3xl p-8">

            <h2 className="text-3xl font-black text-[#1a1d44]">
              Save Settings?
            </h2>

            <p className="text-gray-500 mt-4">
              Your remaining fields & PDF preferences
              can be saved automatically to Firebase.
            </p>

            <div className="flex gap-4 mt-8">

              <button
                onClick={() => {

                  localStorage.setItem(
                    "pdfSettings",
                    JSON.stringify(settings)
                  );

                  setPopup(false);

                }}
                className="flex-1 h-14 rounded-2xl bg-[#4f5fff] text-white font-bold"
              >
                Save
              </button>

              <button
                onClick={() => setPopup(false)}
                className="flex-1 h-14 rounded-2xl border font-bold"
              >
                Later
              </button>

            </div>

          </div>

        </div>

      )}

    </div>
  );

}
